import { DatabaseManager } from '../database/database.js';
import { promisify } from 'util';

export class InventoryService {
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

  async checkInventoryLevels(filters: any = {}): Promise<any> {
    const { category, warehouse, lowStockOnly = false, sortBy = 'quantity' } = filters;
    
    let whereConditions = ['p.status = "active"'];
    let params: any[] = [];

    if (category) {
      whereConditions.push('p.category = ?');
      params.push(category);
    }

    if (warehouse) {
      whereConditions.push('i.warehouse = ?');
      params.push(warehouse);
    }

    if (lowStockOnly) {
      whereConditions.push('i.quantity <= i.reorder_level');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    
    const orderBy = sortBy === 'quantity' ? 'i.quantity ASC' : 
                   sortBy === 'name' ? 'p.name ASC' : 
                   'i.quantity ASC';

    const inventory = await this.all(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.category,
        p.price,
        p.cost,
        i.warehouse,
        i.quantity,
        i.reorder_level,
        i.last_updated,
        CASE 
          WHEN i.quantity <= i.reorder_level THEN 'Low Stock'
          WHEN i.quantity <= i.reorder_level * 2 THEN 'Medium Stock'
          ELSE 'High Stock'
        END as stock_status,
        (i.quantity * p.cost) as inventory_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ${whereClause}
      ORDER BY ${orderBy}
    `, params);

    const summary = await this.get(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN i.quantity <= i.reorder_level THEN 1 ELSE 0 END) as low_stock_count,
        SUM(i.quantity * p.cost) as total_inventory_value,
        AVG(i.quantity) as avg_quantity
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ${whereClause}
    `, params);

    return {
      inventory,
      summary,
      filters,
      insights: [
        `Total products: ${summary.total_products}`,
        `Low stock items: ${summary.low_stock_count}`,
        `Total inventory value: $${summary.total_inventory_value?.toFixed(2) || 0}`
      ]
    };
  }

  async getProductPerformance(filters: any = {}, dateRange?: any): Promise<any> {
    const whereClause = this.buildWhereClause(filters, dateRange);
    
    const productPerformance = await this.all(`
      SELECT 
        p.id,
        p.name,
        p.category,
        p.sku,
        p.price,
        p.cost,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price) as revenue,
        SUM(oi.quantity * p.cost) as total_cost,
        SUM(oi.total_price) - SUM(oi.quantity * p.cost) as profit,
        COUNT(DISTINCT oi.order_id) as order_count,
        AVG(oi.unit_price) as avg_selling_price,
        (SUM(oi.total_price) - SUM(oi.quantity * p.cost)) / SUM(oi.total_price) * 100 as profit_margin
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      GROUP BY p.id, p.name, p.category, p.sku, p.price, p.cost
      ORDER BY revenue DESC
    `);

    const categoryPerformance = await this.all(`
      SELECT 
        p.category,
        COUNT(DISTINCT p.id) as product_count,
        SUM(oi.quantity) as total_units_sold,
        SUM(oi.total_price) as category_revenue,
        AVG((oi.total_price - oi.quantity * p.cost) / oi.total_price * 100) as avg_profit_margin
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      GROUP BY p.category
      ORDER BY category_revenue DESC
    `);

    return {
      productPerformance,
      categoryPerformance,
      insights: [
        `Top performing product: ${productPerformance[0]?.name || 'N/A'}`,
        `Best category: ${categoryPerformance[0]?.category || 'N/A'}`,
        `Total products sold: ${productPerformance.reduce((sum, p) => sum + p.units_sold, 0)}`
      ]
    };
  }

  async getInventoryTurnover(): Promise<any> {
    const turnoverData = await this.all(`
      SELECT 
        p.id,
        p.name,
        p.category,
        i.quantity as current_stock,
        COALESCE(sales_data.units_sold, 0) as units_sold_30_days,
        CASE 
          WHEN COALESCE(sales_data.units_sold, 0) = 0 THEN 0
          ELSE i.quantity / (COALESCE(sales_data.units_sold, 0) / 30.0)
        END as days_of_inventory,
        CASE 
          WHEN COALESCE(sales_data.units_sold, 0) = 0 THEN 'No Sales'
          WHEN i.quantity / (COALESCE(sales_data.units_sold, 0) / 30.0) > 90 THEN 'Slow Moving'
          WHEN i.quantity / (COALESCE(sales_data.units_sold, 0) / 30.0) > 30 THEN 'Normal'
          ELSE 'Fast Moving'
        END as turnover_category
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN (
        SELECT 
          oi.product_id,
          SUM(oi.quantity) as units_sold
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.order_date >= date('now', '-30 days')
        GROUP BY oi.product_id
      ) sales_data ON p.id = sales_data.product_id
      WHERE p.status = 'active'
      ORDER BY days_of_inventory DESC
    `);

    const turnoverSummary = await this.all(`
      SELECT 
        turnover_category,
        COUNT(*) as product_count,
        SUM(current_stock) as total_stock,
        AVG(days_of_inventory) as avg_days_inventory
      FROM (
        SELECT 
          p.id,
          i.quantity as current_stock,
          CASE 
            WHEN COALESCE(sales_data.units_sold, 0) = 0 THEN 'No Sales'
            WHEN i.quantity / (COALESCE(sales_data.units_sold, 0) / 30.0) > 90 THEN 'Slow Moving'
            WHEN i.quantity / (COALESCE(sales_data.units_sold, 0) / 30.0) > 30 THEN 'Normal'
            ELSE 'Fast Moving'
          END as turnover_category,
          CASE 
            WHEN COALESCE(sales_data.units_sold, 0) = 0 THEN 0
            ELSE i.quantity / (COALESCE(sales_data.units_sold, 0) / 30.0)
          END as days_of_inventory
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        LEFT JOIN (
          SELECT 
            oi.product_id,
            SUM(oi.quantity) as units_sold
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE o.order_date >= date('now', '-30 days')
          GROUP BY oi.product_id
        ) sales_data ON p.id = sales_data.product_id
        WHERE p.status = 'active'
      )
      GROUP BY turnover_category
    `);

    return {
      turnoverData,
      turnoverSummary,
      insights: [
        `Slow moving products: ${turnoverSummary.find(t => t.turnover_category === 'Slow Moving')?.product_count || 0}`,
        `Fast moving products: ${turnoverSummary.find(t => t.turnover_category === 'Fast Moving')?.product_count || 0}`,
        `Average inventory days: ${turnoverSummary.reduce((sum, t) => sum + (t.avg_days_inventory || 0), 0) / turnoverSummary.length}`
      ]
    };
  }

  async getWarehouseAnalysis(): Promise<any> {
    const warehouseData = await this.all(`
      SELECT 
        i.warehouse,
        COUNT(DISTINCT i.product_id) as product_count,
        SUM(i.quantity) as total_quantity,
        SUM(i.quantity * p.cost) as total_value,
        AVG(i.quantity) as avg_quantity_per_product,
        COUNT(CASE WHEN i.quantity <= i.reorder_level THEN 1 END) as low_stock_items
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'active'
      GROUP BY i.warehouse
      ORDER BY total_value DESC
    `);

    const warehouseEfficiency = await this.all(`
      SELECT 
        i.warehouse,
        COUNT(DISTINCT i.product_id) as total_products,
        COUNT(CASE WHEN i.quantity > i.reorder_level * 2 THEN 1 END) as well_stocked,
        COUNT(CASE WHEN i.quantity <= i.reorder_level THEN 1 END) as under_stocked,
        COUNT(CASE WHEN i.quantity = 0 THEN 1 END) as out_of_stock,
        (COUNT(CASE WHEN i.quantity > i.reorder_level * 2 THEN 1 END) * 100.0 / COUNT(DISTINCT i.product_id)) as efficiency_score
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'active'
      GROUP BY i.warehouse
      ORDER BY efficiency_score DESC
    `);

    return {
      warehouseData,
      warehouseEfficiency,
      insights: [
        `Most valuable warehouse: ${warehouseData[0]?.warehouse || 'N/A'}`,
        `Most efficient warehouse: ${warehouseEfficiency[0]?.warehouse || 'N/A'}`,
        `Total warehouses: ${warehouseData.length}`
      ]
    };
  }

  async updateInventoryLevels(updates: any[]): Promise<any> {
    const results = [];
    
    for (const update of updates) {
      const { productId, warehouse, quantity, reorderLevel } = update;
      
      await this.run(`
        UPDATE inventory 
        SET quantity = ?, 
            reorder_level = ?,
            last_updated = CURRENT_TIMESTAMP
        WHERE product_id = ? AND warehouse = ?
      `, [quantity, reorderLevel, productId, warehouse]);
      
      results.push({
        productId,
        warehouse,
        quantity,
        reorderLevel,
        status: 'updated'
      });
    }
    
    return {
      updated: results.length,
      results
    };
  }

  async getReorderRecommendations(): Promise<any> {
    const recommendations = await this.all(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.category,
        i.warehouse,
        i.quantity,
        i.reorder_level,
        COALESCE(sales_data.avg_daily_sales, 0) as avg_daily_sales,
        CASE 
          WHEN COALESCE(sales_data.avg_daily_sales, 0) = 0 THEN i.reorder_level * 2
          ELSE CEIL(COALESCE(sales_data.avg_daily_sales, 0) * 30) -- 30 days supply
        END as recommended_order_quantity,
        (i.reorder_level - i.quantity) as urgent_reorder_needed
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN (
        SELECT 
          oi.product_id,
          AVG(oi.quantity / 30.0) as avg_daily_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.order_date >= date('now', '-90 days')
        GROUP BY oi.product_id
      ) sales_data ON p.id = sales_data.product_id
      WHERE p.status = 'active' 
        AND (i.quantity <= i.reorder_level OR i.quantity <= COALESCE(sales_data.avg_daily_sales, 0) * 7)
      ORDER BY urgent_reorder_needed DESC, avg_daily_sales DESC
    `);

    const summary = {
      urgent: recommendations.filter(r => r.urgent_reorder_needed > 0).length,
      recommended: recommendations.length,
      totalValue: recommendations.reduce((sum, r) => sum + (r.recommended_order_quantity * 100), 0) // Estimated cost
    };

    return {
      recommendations,
      summary,
      insights: [
        `Urgent reorders needed: ${summary.urgent}`,
        `Total recommendations: ${summary.recommended}`,
        `Estimated reorder value: $${summary.totalValue.toFixed(2)}`
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
    
    if (filters.productCategory && filters.productCategory.length > 0) {
      conditions.push(`p.category IN (${filters.productCategory.map((cat: string) => `'${cat}'`).join(', ')})`);
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
