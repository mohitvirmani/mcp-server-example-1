import { DatabaseManager } from '../database/database.js';
import { AnalyticsEngine } from '../analytics/analytics.js';
import { promisify } from 'util';

export interface ReportConfig {
  title: string;
  sections: string[];
  format: 'json' | 'csv' | 'pdf';
  includeCharts: boolean;
  includeInsights: boolean;
}

export class ReportGenerator {
  private db: any;
  private analytics: AnalyticsEngine;
  private get: any;
  private all: any;

  constructor(dbManager: DatabaseManager, analyticsEngine: AnalyticsEngine) {
    this.db = dbManager.getDatabase();
    this.analytics = analyticsEngine;
    this.get = promisify(this.db.get.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));
  }

  async generateComprehensiveReport(
    filters: any = {},
    dateRange?: any,
    format: 'json' | 'csv' | 'pdf' = 'json'
  ): Promise<any> {
    const reportData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        filters,
        dateRange,
        format
      },
      executiveSummary: await this.generateExecutiveSummary(filters, dateRange),
      customerAnalytics: await this.analytics.getCustomerAnalytics(filters, dateRange),
      salesPerformance: await this.analytics.getSalesPerformance(filters, dateRange),
      inventoryInsights: await this.analytics.getInventoryInsights(filters),
      financialSummary: await this.analytics.getFinancialSummary(filters, dateRange),
      recommendations: await this.generateRecommendations(filters, dateRange)
    };

    switch (format) {
      case 'csv':
        return this.formatAsCSV(reportData);
      case 'pdf':
        return this.formatAsPDF(reportData);
      default:
        return reportData;
    }
  }

  private async generateExecutiveSummary(filters: any, dateRange?: any): Promise<any> {
    const keyMetrics = await this.get(`
      SELECT 
        COUNT(DISTINCT c.id) as total_customers,
        COUNT(o.id) as total_orders,
        SUM(o.total_amount) as total_revenue,
        AVG(o.total_amount) as avg_order_value
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
    `);

    const topProducts = await this.all(`
      SELECT 
        p.name,
        SUM(oi.total_price) as revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 3
    `);

    const topCustomers = await this.all(`
      SELECT 
        c.name,
        c.company,
        SUM(o.total_amount) as total_spent
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY c.id, c.name, c.company
      ORDER BY total_spent DESC
      LIMIT 3
    `);

    return {
      keyMetrics,
      topProducts,
      topCustomers,
      summary: `Business is performing well with ${keyMetrics.total_customers} active customers generating $${keyMetrics.total_revenue?.toFixed(2)} in revenue.`
    };
  }

  private async generateRecommendations(filters: any, dateRange?: any): Promise<any> {
    const customerAnalytics = await this.analytics.getCustomerAnalytics(filters, dateRange);
    const salesPerformance = await this.analytics.getSalesPerformance(filters, dateRange);
    const inventoryInsights = await this.analytics.getInventoryInsights(filters);

    const recommendations = [
      ...customerAnalytics.recommendations,
      ...salesPerformance.recommendations,
      ...inventoryInsights.recommendations
    ];

    // Remove duplicates and prioritize
    const uniqueRecommendations = [...new Set(recommendations)];
    
    return {
      priority: uniqueRecommendations.slice(0, 5),
      all: uniqueRecommendations,
      implementation: this.generateImplementationPlan(uniqueRecommendations)
    };
  }

  private generateImplementationPlan(recommendations: string[]): any {
    const plan = {
      immediate: [] as any[],
      shortTerm: [] as any[],
      longTerm: [] as any[]
    };

    recommendations.forEach((rec, index) => {
      if (index < 2) {
        plan.immediate.push({
          recommendation: rec,
          timeline: '1-2 weeks',
          resources: 'Internal team',
          priority: 'High'
        });
      } else if (index < 4) {
        plan.shortTerm.push({
          recommendation: rec,
          timeline: '1-3 months',
          resources: 'Internal team + external consultants',
          priority: 'Medium'
        });
      } else {
        plan.longTerm.push({
          recommendation: rec,
          timeline: '3-6 months',
          resources: 'Strategic planning team',
          priority: 'Low'
        });
      }
    });

    return plan;
  }

  async exportData(parameters: any, format: 'json' | 'csv' | 'pdf'): Promise<any> {
    const { dataType, filters = {}, dateRange } = parameters;

    let data;
    switch (dataType) {
      case 'customers':
        data = await this.exportCustomerData(filters, dateRange);
        break;
      case 'orders':
        data = await this.exportOrderData(filters, dateRange);
        break;
      case 'products':
        data = await this.exportProductData(filters);
        break;
      case 'inventory':
        data = await this.exportInventoryData(filters);
        break;
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }

    switch (format) {
      case 'csv':
        return this.formatAsCSV(data);
      case 'pdf':
        return this.formatAsPDF(data);
      default:
        return data;
    }
  }

  private async exportCustomerData(filters: any, dateRange?: any): Promise<any> {
    return await this.all(`
      SELECT 
        c.id,
        c.name,
        c.email,
        c.company,
        c.industry,
        c.location,
        c.customer_tier,
        c.total_spent,
        c.status,
        COUNT(o.id) as order_count,
        MAX(o.order_date) as last_order_date
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY c.id
      ORDER BY c.total_spent DESC
    `);
  }

  private async exportOrderData(filters: any, dateRange?: any): Promise<any> {
    return await this.all(`
      SELECT 
        o.id,
        o.order_date,
        o.status,
        o.total_amount,
        o.payment_method,
        o.region,
        c.name as customer_name,
        c.company,
        sr.name as sales_rep
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN sales_reps sr ON o.sales_rep_id = sr.id
      ${this.buildWhereClause(filters, dateRange)}
      ORDER BY o.order_date DESC
    `);
  }

  private async exportProductData(filters: any): Promise<any> {
    return await this.all(`
      SELECT 
        p.id,
        p.name,
        p.category,
        p.subcategory,
        p.price,
        p.cost,
        p.sku,
        p.brand,
        p.status,
        i.quantity,
        i.warehouse
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.status = 'active'
      ORDER BY p.category, p.name
    `);
  }

  private async exportInventoryData(filters: any): Promise<any> {
    return await this.all(`
      SELECT 
        p.name,
        p.sku,
        p.category,
        i.warehouse,
        i.quantity,
        i.reorder_level,
        CASE 
          WHEN i.quantity <= i.reorder_level THEN 'Low Stock'
          WHEN i.quantity <= i.reorder_level * 2 THEN 'Medium Stock'
          ELSE 'High Stock'
        END as stock_status
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'active'
      ORDER BY i.quantity ASC
    `);
  }

  private formatAsCSV(data: any): any {
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => 
        Object.values(row).map(value => 
          typeof value === 'string' && value.includes(',') ? `"${value}"` : value
        ).join(',')
      );
      
      return [headers, ...rows].join('\n');
    }
    
    // For non-array data, convert to CSV format
    return JSON.stringify(data, null, 2);
  }

  private formatAsPDF(data: any): any {
    // In a real implementation, you would use a PDF generation library
    // For demo purposes, we'll return a structured format that could be converted to PDF
    return {
      format: 'pdf',
      content: data,
      metadata: {
        generatedAt: new Date().toISOString(),
        pageCount: this.estimatePageCount(data),
        sections: this.extractSections(data)
      }
    };
  }

  private estimatePageCount(data: any): number {
    if (Array.isArray(data)) {
      return Math.ceil(data.length / 50); // 50 items per page
    }
    return 1;
  }

  private extractSections(data: any): string[] {
    if (typeof data === 'object' && data !== null) {
      return Object.keys(data);
    }
    return ['data'];
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
