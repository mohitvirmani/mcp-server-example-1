import { DatabaseManager } from '../database/database.js';
import { promisify } from 'util';

export class SalesService {
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

  async createSalesOpportunity(opportunityData: any): Promise<any> {
    const { customerId, productId, quantity, estimatedValue, salesRepId, notes, priority = 'medium' } = opportunityData;
    
    // Validate required fields
    if (!customerId || !productId || !quantity || !estimatedValue) {
      throw new Error('Missing required fields: customerId, productId, quantity, estimatedValue');
    }

    // Check if customer exists
    const customer = await this.get('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    // Check if product exists
    const product = await this.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    // Generate opportunity ID
    const opportunityId = `OPP${Date.now()}`;

    // Create opportunity record (in a real system, you'd have an opportunities table)
    const opportunity = {
      id: opportunityId,
      customerId,
      productId,
      quantity,
      estimatedValue,
      salesRepId,
      notes,
      priority,
      status: 'open',
      createdAt: new Date().toISOString(),
      customer: customer,
      product: product
    };

    return {
      opportunity,
      message: 'Sales opportunity created successfully',
      nextSteps: [
        'Schedule follow-up call with customer',
        'Prepare product demonstration',
        'Create proposal document'
      ]
    };
  }

  async getOrderAnalytics(filters: any = {}, dateRange?: any): Promise<any> {
    const whereClause = this.buildWhereClause(filters, dateRange);
    
    const orderMetrics = await this.get(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value,
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
    `);

    const orderTrends = await this.all(`
      SELECT 
        strftime('%Y-%m', order_date) as month,
        COUNT(*) as order_count,
        SUM(total_amount) as monthly_revenue,
        AVG(total_amount) as avg_order_value
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      GROUP BY strftime('%Y-%m', order_date)
      ORDER BY month DESC
      LIMIT 12
    `);

    const orderStatusDistribution = await this.all(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as revenue,
        AVG(total_amount) as avg_value
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      GROUP BY status
      ORDER BY count DESC
    `);

    const fulfillmentRate = (orderMetrics.delivered_orders / orderMetrics.total_orders) * 100;
    const cancellationRate = (orderMetrics.cancelled_orders / orderMetrics.total_orders) * 100;

    return {
      orderMetrics,
      orderTrends,
      orderStatusDistribution,
      fulfillmentRate,
      cancellationRate,
      insights: [
        `Total orders: ${orderMetrics.total_orders}`,
        `Fulfillment rate: ${fulfillmentRate.toFixed(1)}%`,
        `Cancellation rate: ${cancellationRate.toFixed(1)}%`,
        `Average order value: $${orderMetrics.avg_order_value?.toFixed(2) || 0}`
      ]
    };
  }

  async getSalesRepPerformance(): Promise<any> {
    const repPerformance = await this.all(`
      SELECT 
        sr.id,
        sr.name,
        sr.region,
        COUNT(o.id) as total_orders,
        SUM(o.total_amount) as total_revenue,
        AVG(o.total_amount) as avg_deal_size,
        COUNT(DISTINCT o.customer_id) as unique_customers,
        MAX(o.order_date) as last_order_date
      FROM sales_reps sr
      LEFT JOIN orders o ON sr.id = o.sales_rep_id
      GROUP BY sr.id, sr.name, sr.region
      ORDER BY total_revenue DESC
    `);

    const regionalPerformance = await this.all(`
      SELECT 
        sr.region,
        COUNT(DISTINCT sr.id) as rep_count,
        COUNT(o.id) as total_orders,
        SUM(o.total_amount) as region_revenue,
        AVG(o.total_amount) as avg_deal_size
      FROM sales_reps sr
      LEFT JOIN orders o ON sr.id = o.sales_rep_id
      GROUP BY sr.region
      ORDER BY region_revenue DESC
    `);

    const monthlyPerformance = await this.all(`
      SELECT 
        sr.name,
        strftime('%Y-%m', o.order_date) as month,
        COUNT(o.id) as orders,
        SUM(o.total_amount) as revenue
      FROM sales_reps sr
      LEFT JOIN orders o ON sr.id = o.sales_rep_id
      WHERE o.order_date >= date('now', '-12 months')
      GROUP BY sr.id, sr.name, strftime('%Y-%m', o.order_date)
      ORDER BY sr.name, month DESC
    `);

    return {
      repPerformance,
      regionalPerformance,
      monthlyPerformance,
      insights: [
        `Top performer: ${repPerformance[0]?.name || 'N/A'}`,
        `Best region: ${regionalPerformance[0]?.region || 'N/A'}`,
        `Total sales reps: ${repPerformance.length}`
      ]
    };
  }

  async getSalesForecast(): Promise<any> {
    const historicalData = await this.all(`
      SELECT 
        strftime('%Y-%m', order_date) as month,
        SUM(total_amount) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE order_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', order_date)
      ORDER BY month DESC
    `);

    // Simple trend analysis
    const recentMonths = historicalData.slice(0, 6);
    const olderMonths = historicalData.slice(6, 12);
    
    const recentAvg = recentMonths.reduce((sum, month) => sum + month.revenue, 0) / recentMonths.length;
    const olderAvg = olderMonths.reduce((sum, month) => sum + month.revenue, 0) / olderMonths.length;
    
    const growthRate = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
    
    // Forecast next 6 months
    const forecast = [];
    let currentMonth = new Date();
    for (let i = 1; i <= 6; i++) {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      const forecastRevenue = recentAvg * Math.pow(1 + (growthRate / 100), i);
      const forecastOrders = Math.round(recentMonths.reduce((sum, month) => sum + month.orders, 0) / recentMonths.length * (1 + (growthRate / 100) * i));
      
      forecast.push({
        month: currentMonth.toISOString().slice(0, 7),
        forecasted_revenue: Math.max(0, forecastRevenue),
        forecasted_orders: Math.max(0, forecastOrders),
        confidence: Math.max(0.3, 1 - (i * 0.1))
      });
    }

    return {
      historicalData,
      forecast,
      growthRate,
      insights: [
        `Current growth rate: ${growthRate.toFixed(1)}%`,
        `6-month forecast: $${forecast.reduce((sum, f) => sum + f.forecasted_revenue, 0).toFixed(2)}`,
        `Expected orders: ${forecast.reduce((sum, f) => sum + f.forecasted_orders, 0)}`
      ]
    };
  }

  async getCustomerAcquisitionMetrics(): Promise<any> {
    const acquisitionData = await this.all(`
      SELECT 
        strftime('%Y-%m', acquisition_date) as month,
        COUNT(*) as new_customers,
        SUM(total_spent) as acquisition_revenue
      FROM customers
      WHERE acquisition_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', acquisition_date)
      ORDER BY month DESC
    `);

    const acquisitionChannels = await this.all(`
      SELECT 
        industry,
        COUNT(*) as customers_acquired,
        AVG(total_spent) as avg_customer_value,
        SUM(total_spent) as total_acquisition_revenue
      FROM customers
      WHERE acquisition_date >= date('now', '-12 months')
      GROUP BY industry
      ORDER BY total_acquisition_revenue DESC
    `);

    const customerLifetimeValue = await this.get(`
      SELECT 
        AVG(total_spent) as avg_clv,
        AVG(julianday('now') - julianday(acquisition_date)) as avg_customer_age_days
      FROM customers
      WHERE acquisition_date >= date('now', '-12 months')
    `);

    return {
      acquisitionData,
      acquisitionChannels,
      customerLifetimeValue,
      insights: [
        `New customers this year: ${acquisitionData.reduce((sum, month) => sum + month.new_customers, 0)}`,
        `Average CLV: $${customerLifetimeValue.avg_clv?.toFixed(2) || 0}`,
        `Top acquisition channel: ${acquisitionChannels[0]?.industry || 'N/A'}`
      ]
    };
  }

  async getSalesPipeline(): Promise<any> {
    // In a real system, you'd have a proper pipeline/opportunities table
    // For demo purposes, we'll simulate pipeline data based on recent customer activity
    
    const pipelineData = await this.all(`
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.company,
        c.customer_tier,
        c.total_spent,
        MAX(o.order_date) as last_order_date,
        julianday('now') - julianday(MAX(o.order_date)) as days_since_last_order,
        CASE 
          WHEN julianday('now') - julianday(MAX(o.order_date)) <= 30 THEN 'Hot Lead'
          WHEN julianday('now') - julianday(MAX(o.order_date)) <= 60 THEN 'Warm Lead'
          WHEN julianday('now') - julianday(MAX(o.order_date)) <= 90 THEN 'Cold Lead'
          ELSE 'Inactive'
        END as lead_status,
        CASE 
          WHEN c.customer_tier = 'platinum' THEN c.total_spent * 0.2
          WHEN c.customer_tier = 'gold' THEN c.total_spent * 0.15
          WHEN c.customer_tier = 'silver' THEN c.total_spent * 0.1
          ELSE c.total_spent * 0.05
        END as estimated_opportunity_value
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
      HAVING lead_status IN ('Hot Lead', 'Warm Lead')
      ORDER BY estimated_opportunity_value DESC
    `);

    const pipelineSummary = await this.all(`
      SELECT 
        lead_status,
        COUNT(*) as lead_count,
        SUM(estimated_opportunity_value) as total_value
      FROM (
        SELECT 
          c.id,
          CASE 
            WHEN julianday('now') - julianday(MAX(o.order_date)) <= 30 THEN 'Hot Lead'
            WHEN julianday('now') - julianday(MAX(o.order_date)) <= 60 THEN 'Warm Lead'
            WHEN julianday('now') - julianday(MAX(o.order_date)) <= 90 THEN 'Cold Lead'
            ELSE 'Inactive'
          END as lead_status,
          CASE 
            WHEN c.customer_tier = 'platinum' THEN c.total_spent * 0.2
            WHEN c.customer_tier = 'gold' THEN c.total_spent * 0.15
            WHEN c.customer_tier = 'silver' THEN c.total_spent * 0.1
            ELSE c.total_spent * 0.05
          END as estimated_opportunity_value
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
        HAVING lead_status IN ('Hot Lead', 'Warm Lead')
      )
      GROUP BY lead_status
    `);

    return {
      pipelineData,
      pipelineSummary,
      insights: [
        `Total pipeline value: $${pipelineSummary.reduce((sum, stage) => sum + stage.total_value, 0).toFixed(2)}`,
        `Hot leads: ${pipelineSummary.find(s => s.lead_status === 'Hot Lead')?.lead_count || 0}`,
        `Warm leads: ${pipelineSummary.find(s => s.lead_status === 'Warm Lead')?.lead_count || 0}`
      ]
    };
  }

  private buildWhereClause(filters: any, dateRange?: any): string {
    const conditions = [];
    
    if (filters.customerTier && filters.customerTier.length > 0) {
      conditions.push(`c.customer_tier IN (${filters.customerTier.map((tier: string) => `'${tier}'`).join(', ')})`);
    }
    
    if (filters.industry && filters.industry.length > 0) {
      conditions.push(`c.industry IN (${filters.industry.map((ind: string) => `'${ind}'`).join(', ')})`);
    }
    
    if (filters.region && filters.region.length > 0) {
      conditions.push(`o.region IN (${filters.region.map((reg: string) => `'${reg}'`).join(', ')})`);
    }
    
    if (filters.status && filters.status.length > 0) {
      conditions.push(`o.status IN (${filters.status.map((stat: string) => `'${stat}'`).join(', ')})`);
    }
    
    if (dateRange?.start) {
      conditions.push(`o.order_date >= '${dateRange.start}'`);
    }
    
    if (dateRange?.end) {
      conditions.push(`o.order_date <= '${dateRange.end}'`);
    }
    
    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }
}
