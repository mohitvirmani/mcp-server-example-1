import { DatabaseManager } from '../database/database.js';
import { promisify } from 'util';

export interface AnalyticsResult {
  data: any;
  insights: string[];
  recommendations: string[];
  metrics: Record<string, number>;
  trends: Record<string, any>;
}

export interface DateRange {
  start?: string;
  end?: string;
}

export interface Filters {
  customerTier?: string[];
  industry?: string[];
  region?: string[];
  productCategory?: string[];
  status?: string[];
}

export class AnalyticsEngine {
  private db: any;
  private get: any;
  private all: any;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDatabase();
    this.get = promisify(this.db.get.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));
  }

  async getCustomerAnalytics(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const whereClause = this.buildWhereClause(filters, dateRange);
    
    // Customer metrics
    const totalCustomers = await this.get(`
      SELECT COUNT(*) as count FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${whereClause}
    `);

    const customerTierDistribution = await this.all(`
      SELECT customer_tier, COUNT(*) as count, AVG(total_spent) as avg_spent
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${whereClause}
      GROUP BY customer_tier
    `);

    const industryBreakdown = await this.all(`
      SELECT industry, COUNT(*) as count, SUM(total_spent) as total_revenue
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${whereClause}
      GROUP BY industry
      ORDER BY total_revenue DESC
    `);

    const customerLifetimeValue = await this.get(`
      SELECT AVG(total_spent) as avg_clv, MAX(total_spent) as max_clv, MIN(total_spent) as min_clv
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${whereClause}
    `);

    const insights = [
      `Total active customers: ${totalCustomers.count}`,
      `Average customer lifetime value: $${customerLifetimeValue.avg_clv?.toFixed(2) || 0}`,
      `Top performing industry: ${industryBreakdown[0]?.industry || 'N/A'}`
    ];

    const recommendations = [
      'Focus on platinum tier customers for retention programs',
      'Develop industry-specific marketing campaigns',
      'Implement customer segmentation strategies'
    ];

    return {
      data: {
        totalCustomers: totalCustomers.count,
        customerTierDistribution,
        industryBreakdown,
        customerLifetimeValue
      },
      insights,
      recommendations,
      metrics: {
        totalCustomers: totalCustomers.count,
        avgCLV: customerLifetimeValue.avg_clv || 0,
        maxCLV: customerLifetimeValue.max_clv || 0
      },
      trends: {
        tierDistribution: customerTierDistribution,
        industryPerformance: industryBreakdown
      }
    };
  }

  async getSalesPerformance(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const whereClause = this.buildWhereClause(filters, dateRange);
    
    const salesMetrics = await this.get(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
    `);

    const monthlySales = await this.all(`
      SELECT 
        strftime('%Y-%m', order_date) as month,
        COUNT(*) as orders,
        SUM(total_amount) as revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      GROUP BY strftime('%Y-%m', order_date)
      ORDER BY month DESC
      LIMIT 12
    `);

    const salesRepPerformance = await this.all(`
      SELECT 
        sr.name,
        sr.region,
        COUNT(o.id) as orders,
        SUM(o.total_amount) as revenue,
        AVG(o.total_amount) as avg_deal_size
      FROM sales_reps sr
      LEFT JOIN orders o ON sr.id = o.sales_rep_id
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      GROUP BY sr.id, sr.name, sr.region
      ORDER BY revenue DESC
    `);

    const insights = [
      `Total revenue: $${salesMetrics.total_revenue?.toFixed(2) || 0}`,
      `Average order value: $${salesMetrics.avg_order_value?.toFixed(2) || 0}`,
      `Top performing sales rep: ${salesRepPerformance[0]?.name || 'N/A'}`
    ];

    const recommendations = [
      'Implement sales training for underperforming regions',
      'Focus on increasing average order value',
      'Develop targeted campaigns for high-value customers'
    ];

    return {
      data: {
        salesMetrics,
        monthlySales,
        salesRepPerformance
      },
      insights,
      recommendations,
      metrics: {
        totalRevenue: salesMetrics.total_revenue || 0,
        avgOrderValue: salesMetrics.avg_order_value || 0,
        totalOrders: salesMetrics.total_orders || 0
      },
      trends: {
        monthlyTrend: monthlySales,
        repPerformance: salesRepPerformance
      }
    };
  }

  async getInventoryInsights(filters: Filters = {}): Promise<AnalyticsResult> {
    const inventoryStatus = await this.all(`
      SELECT 
        p.name,
        p.category,
        p.sku,
        i.quantity,
        i.reorder_level,
        i.warehouse,
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

    const lowStockItems = inventoryStatus.filter(item => item.stock_status === 'Low Stock');
    const categoryBreakdown = await this.all(`
      SELECT 
        p.category,
        COUNT(*) as product_count,
        SUM(i.quantity) as total_quantity,
        AVG(i.quantity) as avg_quantity
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'active'
      GROUP BY p.category
    `);

    const warehouseDistribution = await this.all(`
      SELECT 
        warehouse,
        COUNT(*) as products,
        SUM(quantity) as total_quantity
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'active'
      GROUP BY warehouse
    `);

    const insights = [
      `Total products in inventory: ${inventoryStatus.length}`,
      `Low stock items: ${lowStockItems.length}`,
      `Most stocked category: ${categoryBreakdown[0]?.category || 'N/A'}`
    ];

    const recommendations = [
      'Reorder low stock items immediately',
      'Optimize warehouse distribution',
      'Implement automated reorder alerts'
    ];

    return {
      data: {
        inventoryStatus,
        lowStockItems,
        categoryBreakdown,
        warehouseDistribution
      },
      insights,
      recommendations,
      metrics: {
        totalProducts: inventoryStatus.length,
        lowStockCount: lowStockItems.length,
        totalValue: inventoryStatus.reduce((sum, item) => sum + (item.quantity * 100), 0) // Estimated value
      },
      trends: {
        stockLevels: inventoryStatus,
        categoryDistribution: categoryBreakdown
      }
    };
  }

  async predictSalesTrends(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const historicalData = await this.all(`
      SELECT 
        strftime('%Y-%m', order_date) as month,
        SUM(total_amount) as revenue,
        COUNT(*) as orders
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY strftime('%Y-%m', order_date)
      ORDER BY month DESC
      LIMIT 12
    `);

    // Simple trend analysis
    const recentMonths = historicalData.slice(0, 6);
    const olderMonths = historicalData.slice(6, 12);
    
    const recentAvg = recentMonths.reduce((sum, month) => sum + month.revenue, 0) / recentMonths.length;
    const olderAvg = olderMonths.reduce((sum, month) => sum + month.revenue, 0) / olderMonths.length;
    
    const growthRate = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    // Simple forecast for next 3 months
    const forecast = [];
    let currentMonth = new Date();
    for (let i = 1; i <= 3; i++) {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      const forecastRevenue = recentAvg * (1 + (growthRate / 100) * i);
      forecast.push({
        month: currentMonth.toISOString().slice(0, 7),
        predicted_revenue: Math.max(0, forecastRevenue),
        confidence: Math.max(0.5, 1 - (i * 0.1))
      });
    }

    const insights = [
      `Sales growth rate: ${growthRate.toFixed(1)}%`,
      `Average monthly revenue: $${recentAvg.toFixed(2)}`,
      `Next quarter forecast: $${forecast.reduce((sum, f) => sum + f.predicted_revenue, 0).toFixed(2)}`
    ];

    const recommendations = [
      growthRate > 0 ? 'Maintain current growth strategies' : 'Implement growth initiatives',
      'Monitor forecast accuracy monthly',
      'Adjust inventory based on predicted demand'
    ];

    return {
      data: {
        historicalData,
        forecast,
        growthRate
      },
      insights,
      recommendations,
      metrics: {
        growthRate,
        avgMonthlyRevenue: recentAvg,
        forecastedRevenue: forecast.reduce((sum, f) => sum + f.predicted_revenue, 0)
      },
      trends: {
        historical: historicalData,
        predicted: forecast
      }
    };
  }

  async analyzeCustomerBehavior(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const customerSegments = await this.all(`
      SELECT 
        customer_tier,
        COUNT(*) as count,
        AVG(total_spent) as avg_spent,
        AVG(julianday('now') - julianday(acquisition_date)) as avg_days_since_acquisition
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY customer_tier
    `);

    const purchasePatterns = await this.all(`
      SELECT 
        strftime('%w', order_date) as day_of_week,
        strftime('%H', order_date) as hour_of_day,
        COUNT(*) as order_count,
        AVG(total_amount) as avg_amount
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY strftime('%w', order_date), strftime('%H', order_date)
      ORDER BY order_count DESC
    `);

    const customerRetention = await this.get(`
      SELECT 
        COUNT(DISTINCT customer_id) as total_customers,
        COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END) as repeat_customers
      FROM (
        SELECT customer_id, COUNT(*) as order_count
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        ${this.buildWhereClause(filters, dateRange)}
        GROUP BY customer_id
      )
    `);

    const retentionRate = (customerRetention.repeat_customers / customerRetention.total_customers) * 100;

    const insights = [
      `Customer retention rate: ${retentionRate.toFixed(1)}%`,
      `Most active day: ${this.getDayName(purchasePatterns[0]?.day_of_week)}`,
      `Peak ordering hour: ${purchasePatterns[0]?.hour_of_day}:00`
    ];

    const recommendations = [
      'Implement loyalty programs for repeat customers',
      'Optimize marketing campaigns for peak hours',
      'Develop segment-specific engagement strategies'
    ];

    return {
      data: {
        customerSegments,
        purchasePatterns,
        customerRetention,
        retentionRate
      },
      insights,
      recommendations,
      metrics: {
        retentionRate,
        totalCustomers: customerRetention.total_customers,
        repeatCustomers: customerRetention.repeat_customers
      },
      trends: {
        segments: customerSegments,
        patterns: purchasePatterns
      }
    };
  }

  async getRevenueForecast(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const currentRevenue = await this.get(`
      SELECT SUM(total_amount) as total_revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
    `);

    const monthlyGrowth = await this.all(`
      SELECT 
        strftime('%Y-%m', order_date) as month,
        SUM(total_amount) as revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY strftime('%Y-%m', order_date)
      ORDER BY month DESC
      LIMIT 6
    `);

    // Calculate growth rate
    const growthRate = monthlyGrowth.length > 1 ? 
      ((monthlyGrowth[0].revenue - monthlyGrowth[1].revenue) / monthlyGrowth[1].revenue) * 100 : 0;

    // Forecast next 12 months
    const forecast = [];
    let currentMonth = new Date();
    for (let i = 1; i <= 12; i++) {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      const forecastRevenue = currentRevenue.total_revenue * Math.pow(1 + (growthRate / 100), i);
      forecast.push({
        month: currentMonth.toISOString().slice(0, 7),
        forecasted_revenue: Math.max(0, forecastRevenue),
        confidence: Math.max(0.3, 1 - (i * 0.05))
      });
    }

    const insights = [
      `Current revenue: $${currentRevenue.total_revenue?.toFixed(2) || 0}`,
      `Monthly growth rate: ${growthRate.toFixed(1)}%`,
      `Annual forecast: $${forecast.reduce((sum, f) => sum + f.forecasted_revenue, 0).toFixed(2)}`
    ];

    const recommendations = [
      growthRate > 5 ? 'Maintain growth momentum' : 'Focus on revenue growth strategies',
      'Monitor forecast accuracy quarterly',
      'Adjust business strategies based on forecast trends'
    ];

    return {
      data: {
        currentRevenue,
        monthlyGrowth,
        forecast,
        growthRate
      },
      insights,
      recommendations,
      metrics: {
        currentRevenue: currentRevenue.total_revenue || 0,
        growthRate,
        forecastedAnnualRevenue: forecast.reduce((sum, f) => sum + f.forecasted_revenue, 0)
      },
      trends: {
        historical: monthlyGrowth,
        forecasted: forecast
      }
    };
  }

  async identifyTopProducts(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const topProducts = await this.all(`
      SELECT 
        p.name,
        p.category,
        p.sku,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count,
        AVG(oi.unit_price) as avg_price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY p.id, p.name, p.category, p.sku
      ORDER BY total_revenue DESC
      LIMIT 10
    `);

    const categoryPerformance = await this.all(`
      SELECT 
        p.category,
        COUNT(DISTINCT p.id) as product_count,
        SUM(oi.total_price) as category_revenue,
        AVG(oi.unit_price) as avg_category_price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY p.category
      ORDER BY category_revenue DESC
    `);

    const insights = [
      `Top product: ${topProducts[0]?.name || 'N/A'}`,
      `Best performing category: ${categoryPerformance[0]?.category || 'N/A'}`,
      `Total products sold: ${topProducts.reduce((sum, p) => sum + p.total_quantity, 0)}`
    ];

    const recommendations = [
      'Increase inventory for top-performing products',
      'Develop similar products in successful categories',
      'Optimize pricing for underperforming products'
    ];

    return {
      data: {
        topProducts,
        categoryPerformance
      },
      insights,
      recommendations,
      metrics: {
        topProductRevenue: topProducts[0]?.total_revenue || 0,
        totalProductsSold: topProducts.reduce((sum, p) => sum + p.total_quantity, 0),
        categoryCount: categoryPerformance.length
      },
      trends: {
        productRankings: topProducts,
        categoryTrends: categoryPerformance
      }
    };
  }

  async analyzeMarketSegments(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const segmentAnalysis = await this.all(`
      SELECT 
        c.industry,
        c.customer_tier,
        COUNT(DISTINCT c.id) as customer_count,
        SUM(o.total_amount) as segment_revenue,
        AVG(o.total_amount) as avg_order_value,
        COUNT(o.id) as total_orders
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY c.industry, c.customer_tier
      ORDER BY segment_revenue DESC
    `);

    const geographicAnalysis = await this.all(`
      SELECT 
        c.location,
        COUNT(DISTINCT c.id) as customer_count,
        SUM(o.total_amount) as location_revenue,
        AVG(o.total_amount) as avg_order_value
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY c.location
      ORDER BY location_revenue DESC
    `);

    const insights = [
      `Most valuable segment: ${segmentAnalysis[0]?.industry || 'N/A'} - ${segmentAnalysis[0]?.customer_tier || 'N/A'}`,
      `Top geographic market: ${geographicAnalysis[0]?.location || 'N/A'}`,
      `Total market segments: ${segmentAnalysis.length}`
    ];

    const recommendations = [
      'Focus marketing efforts on high-value segments',
      'Expand operations in top-performing locations',
      'Develop segment-specific product offerings'
    ];

    return {
      data: {
        segmentAnalysis,
        geographicAnalysis
      },
      insights,
      recommendations,
      metrics: {
        topSegmentRevenue: segmentAnalysis[0]?.segment_revenue || 0,
        totalSegments: segmentAnalysis.length,
        topLocationRevenue: geographicAnalysis[0]?.location_revenue || 0
      },
      trends: {
        segmentPerformance: segmentAnalysis,
        geographicTrends: geographicAnalysis
      }
    };
  }

  async getOperationalMetrics(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const orderMetrics = await this.get(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        AVG(julianday('now') - julianday(order_date)) as avg_order_age_days
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
    `);

    const fulfillmentRate = (orderMetrics.delivered_orders / orderMetrics.total_orders) * 100;
    const cancellationRate = (orderMetrics.cancelled_orders / orderMetrics.total_orders) * 100;

    const paymentMethods = await this.all(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        SUM(total_amount) as total_amount
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `);

    const insights = [
      `Order fulfillment rate: ${fulfillmentRate.toFixed(1)}%`,
      `Cancellation rate: ${cancellationRate.toFixed(1)}%`,
      `Average order processing time: ${orderMetrics.avg_order_age_days?.toFixed(1) || 0} days`
    ];

    const recommendations = [
      cancellationRate > 10 ? 'Investigate and reduce cancellation causes' : 'Maintain low cancellation rate',
      fulfillmentRate < 90 ? 'Improve fulfillment processes' : 'Excellent fulfillment performance',
      'Optimize payment method offerings based on customer preferences'
    ];

    return {
      data: {
        orderMetrics,
        fulfillmentRate,
        cancellationRate,
        paymentMethods
      },
      insights,
      recommendations,
      metrics: {
        fulfillmentRate,
        cancellationRate,
        avgOrderAge: orderMetrics.avg_order_age_days || 0
      },
      trends: {
        orderStatus: orderMetrics,
        paymentTrends: paymentMethods
      }
    };
  }

  async analyzeGeographicSales(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const geographicData = await this.all(`
      SELECT 
        c.location,
        COUNT(DISTINCT c.id) as customer_count,
        COUNT(o.id) as order_count,
        SUM(o.total_amount) as total_revenue,
        AVG(o.total_amount) as avg_order_value
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY c.location
      ORDER BY total_revenue DESC
    `);

    const regionalPerformance = await this.all(`
      SELECT 
        o.region,
        COUNT(DISTINCT c.id) as customer_count,
        SUM(o.total_amount) as region_revenue,
        AVG(o.total_amount) as avg_order_value
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY o.region
      ORDER BY region_revenue DESC
    `);

    const insights = [
      `Top performing location: ${geographicData[0]?.location || 'N/A'}`,
      `Best region: ${regionalPerformance[0]?.region || 'N/A'}`,
      `Geographic coverage: ${geographicData.length} locations`
    ];

    const recommendations = [
      'Expand operations in high-performing locations',
      'Investigate opportunities in underperforming regions',
      'Develop location-specific marketing strategies'
    ];

    return {
      data: {
        geographicData,
        regionalPerformance
      },
      insights,
      recommendations,
      metrics: {
        topLocationRevenue: geographicData[0]?.total_revenue || 0,
        topRegionRevenue: regionalPerformance[0]?.region_revenue || 0,
        locationCount: geographicData.length
      },
      trends: {
        locationPerformance: geographicData,
        regionalTrends: regionalPerformance
      }
    };
  }

  async getFinancialSummary(filters: Filters = {}, dateRange?: DateRange): Promise<AnalyticsResult> {
    const financialMetrics = await this.get(`
      SELECT 
        SUM(o.total_amount) as total_revenue,
        COUNT(o.id) as total_orders,
        AVG(o.total_amount) as avg_order_value,
        COUNT(DISTINCT o.customer_id) as unique_customers
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
    `);

    const productProfitability = await this.all(`
      SELECT 
        p.name,
        p.category,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price) as revenue,
        SUM(oi.quantity * p.cost) as total_cost,
        SUM(oi.total_price) - SUM(oi.quantity * p.cost) as profit,
        (SUM(oi.total_price) - SUM(oi.quantity * p.cost)) / SUM(oi.total_price) * 100 as profit_margin
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      ${this.buildWhereClause(filters, dateRange)}
      GROUP BY p.id, p.name, p.category
      ORDER BY profit DESC
      LIMIT 10
    `);

    const totalProfit = productProfitability.reduce((sum, product) => sum + product.profit, 0);
    const overallMargin = (totalProfit / financialMetrics.total_revenue) * 100;

    const insights = [
      `Total revenue: $${financialMetrics.total_revenue?.toFixed(2) || 0}`,
      `Overall profit margin: ${overallMargin.toFixed(1)}%`,
      `Most profitable product: ${productProfitability[0]?.name || 'N/A'}`
    ];

    const recommendations = [
      overallMargin < 20 ? 'Focus on improving profit margins' : 'Maintain healthy profit margins',
      'Increase sales of high-margin products',
      'Review pricing strategy for low-margin items'
    ];

    return {
      data: {
        financialMetrics,
        productProfitability,
        totalProfit,
        overallMargin
      },
      insights,
      recommendations,
      metrics: {
        totalRevenue: financialMetrics.total_revenue || 0,
        totalProfit,
        profitMargin: overallMargin
      },
      trends: {
        profitability: productProfitability,
        financialHealth: financialMetrics
      }
    };
  }

  private buildWhereClause(filters: Filters, dateRange?: DateRange): string {
    const conditions = [];
    
    if (filters.customerTier && filters.customerTier.length > 0) {
      conditions.push(`c.customer_tier IN (${filters.customerTier.map(tier => `'${tier}'`).join(', ')})`);
    }
    
    if (filters.industry && filters.industry.length > 0) {
      conditions.push(`c.industry IN (${filters.industry.map(ind => `'${ind}'`).join(', ')})`);
    }
    
    if (filters.region && filters.region.length > 0) {
      conditions.push(`o.region IN (${filters.region.map(reg => `'${reg}'`).join(', ')})`);
    }
    
    if (filters.productCategory && filters.productCategory.length > 0) {
      conditions.push(`p.category IN (${filters.productCategory.map(cat => `'${cat}'`).join(', ')})`);
    }
    
    if (filters.status && filters.status.length > 0) {
      conditions.push(`o.status IN (${filters.status.map(stat => `'${stat}'`).join(', ')})`);
    }
    
    if (dateRange?.start) {
      conditions.push(`o.order_date >= '${dateRange.start}'`);
    }
    
    if (dateRange?.end) {
      conditions.push(`o.order_date <= '${dateRange.end}'`);
    }
    
    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  private getDayName(dayNumber: string): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[parseInt(dayNumber)] || 'Unknown';
  }
}
