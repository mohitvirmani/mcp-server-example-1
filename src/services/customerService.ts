import { DatabaseManager, Customer } from '../database/database.js';
import { promisify } from 'util';

export class CustomerService {
  private db: any;
  private get: any;
  private all: any;
  private run: any;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDatabase();
    this.get = promisify(this.db.get.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));
    this.run = promisify(this.db.run.bind(this.db));
  }

  async searchCustomers(searchParams: any): Promise<any> {
    const { query, customerTier, industry, location, status, limit = 50 } = searchParams;
    
    let whereConditions = [];
    let params: any[] = [];

    if (query) {
      whereConditions.push(`(c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ?)`);
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (customerTier) {
      whereConditions.push(`c.customer_tier = ?`);
      params.push(customerTier);
    }

    if (industry) {
      whereConditions.push(`c.industry = ?`);
      params.push(industry);
    }

    if (location) {
      whereConditions.push(`c.location LIKE ?`);
      params.push(`%${location}%`);
    }

    if (status) {
      whereConditions.push(`c.status = ?`);
      params.push(status);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const customers = await this.all(`
      SELECT 
        c.*,
        COUNT(o.id) as order_count,
        MAX(o.order_date) as last_order_date,
        SUM(o.total_amount) as lifetime_value
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.total_spent DESC
      LIMIT ?
    `, [...params, limit]);

    return {
      customers,
      total: customers.length,
      searchParams
    };
  }

  async getCustomerDetails(customerId: string): Promise<any> {
    const customer = await this.get(`
      SELECT * FROM customers WHERE id = ?
    `, [customerId]);

    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    const orders = await this.all(`
      SELECT 
        o.*,
        sr.name as sales_rep_name
      FROM orders o
      LEFT JOIN sales_reps sr ON o.sales_rep_id = sr.id
      WHERE o.customer_id = ?
      ORDER BY o.order_date DESC
    `, [customerId]);

    const orderItems = await this.all(`
      SELECT 
        oi.*,
        p.name as product_name,
        p.category,
        p.sku
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.customer_id = ?
      ORDER BY o.order_date DESC
    `, [customerId]);

    const customerMetrics = await this.get(`
      SELECT 
        COUNT(o.id) as total_orders,
        SUM(o.total_amount) as total_spent,
        AVG(o.total_amount) as avg_order_value,
        MIN(o.order_date) as first_order_date,
        MAX(o.order_date) as last_order_date
      FROM orders o
      WHERE o.customer_id = ?
    `, [customerId]);

    return {
      customer,
      orders,
      orderItems,
      metrics: customerMetrics,
      summary: {
        totalOrders: customerMetrics.total_orders || 0,
        totalSpent: customerMetrics.total_spent || 0,
        avgOrderValue: customerMetrics.avg_order_value || 0,
        customerSince: customerMetrics.first_order_date,
        lastOrder: customerMetrics.last_order_date
      }
    };
  }

  async updateCustomerInfo(customerId: string, updateData: any): Promise<any> {
    const allowedFields = [
      'name', 'email', 'phone', 'company', 'industry', 
      'location', 'customer_tier', 'status', 'notes'
    ];

    const updateFields = [];
    const values = [];

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(customerId);

    await this.run(`
      UPDATE customers 
      SET ${updateFields.join(', ')}, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, values);

    return await this.getCustomerDetails(customerId);
  }

  async getCustomerSegments(): Promise<any> {
    const segments = await this.all(`
      SELECT 
        customer_tier,
        industry,
        COUNT(*) as customer_count,
        AVG(total_spent) as avg_spent,
        SUM(total_spent) as total_revenue
      FROM customers
      GROUP BY customer_tier, industry
      ORDER BY total_revenue DESC
    `);

    const tierAnalysis = await this.all(`
      SELECT 
        customer_tier,
        COUNT(*) as count,
        AVG(total_spent) as avg_spent,
        MIN(total_spent) as min_spent,
        MAX(total_spent) as max_spent
      FROM customers
      GROUP BY customer_tier
      ORDER BY avg_spent DESC
    `);

    return {
      segments,
      tierAnalysis,
      insights: [
        `Total customer segments: ${segments.length}`,
        `Highest value tier: ${tierAnalysis[0]?.customer_tier || 'N/A'}`,
        `Most customers in: ${segments[0]?.customer_tier || 'N/A'} - ${segments[0]?.industry || 'N/A'}`
      ]
    };
  }

  async getCustomerLifecycle(): Promise<any> {
    const lifecycleData = await this.all(`
      SELECT 
        CASE 
          WHEN julianday('now') - julianday(acquisition_date) <= 30 THEN 'New (0-30 days)'
          WHEN julianday('now') - julianday(acquisition_date) <= 90 THEN 'Recent (31-90 days)'
          WHEN julianday('now') - julianday(acquisition_date) <= 365 THEN 'Established (91-365 days)'
          ELSE 'Mature (365+ days)'
        END as lifecycle_stage,
        COUNT(*) as customer_count,
        AVG(total_spent) as avg_spent,
        AVG(julianday('now') - julianday(acquisition_date)) as avg_days_since_acquisition
      FROM customers
      GROUP BY lifecycle_stage
      ORDER BY avg_days_since_acquisition
    `);

    const retentionAnalysis = await this.all(`
      SELECT 
        strftime('%Y-%m', acquisition_date) as acquisition_month,
        COUNT(*) as acquired_customers,
        COUNT(CASE WHEN last_order_date >= date('now', '-30 days') THEN 1 END) as active_customers
      FROM customers
      WHERE acquisition_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', acquisition_date)
      ORDER BY acquisition_month DESC
    `);

    return {
      lifecycleData,
      retentionAnalysis,
      insights: [
        `Most customers are in: ${lifecycleData[0]?.lifecycle_stage || 'N/A'} stage`,
        `Average customer age: ${lifecycleData.reduce((sum, stage) => sum + stage.avg_days_since_acquisition, 0) / lifecycleData.length} days`,
        `Recent retention rate: ${retentionAnalysis[0] ? (retentionAnalysis[0].active_customers / retentionAnalysis[0].acquired_customers * 100).toFixed(1) : 0}%`
      ]
    };
  }

  async getCustomerChurnRisk(): Promise<any> {
    const churnRisk = await this.all(`
      SELECT 
        c.id,
        c.name,
        c.company,
        c.customer_tier,
        c.total_spent,
        MAX(o.order_date) as last_order_date,
        julianday('now') - julianday(MAX(o.order_date)) as days_since_last_order,
        CASE 
          WHEN julianday('now') - julianday(MAX(o.order_date)) > 90 THEN 'High Risk'
          WHEN julianday('now') - julianday(MAX(o.order_date)) > 60 THEN 'Medium Risk'
          WHEN julianday('now') - julianday(MAX(o.order_date)) > 30 THEN 'Low Risk'
          ELSE 'Active'
        END as churn_risk
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
      HAVING churn_risk IN ('High Risk', 'Medium Risk')
      ORDER BY days_since_last_order DESC
    `);

    const riskDistribution = await this.all(`
      SELECT 
        churn_risk,
        COUNT(*) as customer_count,
        SUM(total_spent) as total_value_at_risk
      FROM (
        SELECT 
          c.id,
          c.total_spent,
          CASE 
            WHEN julianday('now') - julianday(MAX(o.order_date)) > 90 THEN 'High Risk'
            WHEN julianday('now') - julianday(MAX(o.order_date)) > 60 THEN 'Medium Risk'
            WHEN julianday('now') - julianday(MAX(o.order_date)) > 30 THEN 'Low Risk'
            ELSE 'Active'
          END as churn_risk
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
      )
      GROUP BY churn_risk
    `);

    return {
      churnRisk,
      riskDistribution,
      insights: [
        `Customers at risk: ${churnRisk.length}`,
        `Value at risk: $${riskDistribution.reduce((sum, risk) => sum + (risk.total_value_at_risk || 0), 0).toFixed(2)}`,
        `High risk customers: ${riskDistribution.find(r => r.churn_risk === 'High Risk')?.customer_count || 0}`
      ],
      recommendations: [
        'Implement customer retention campaigns for high-risk customers',
        'Create win-back offers for medium-risk customers',
        'Develop proactive engagement strategies'
      ]
    };
  }
}
