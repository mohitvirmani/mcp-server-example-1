import Database from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  location: string;
  customerTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  acquisitionDate: string;
  totalSpent: number;
  lastOrderDate: string;
  status: 'active' | 'inactive' | 'prospect';
  notes: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  cost: number;
  sku: string;
  description: string;
  brand: string;
  weight: number;
  dimensions: string;
  status: 'active' | 'discontinued' | 'out_of_stock';
  launchDate: string;
}

export interface Order {
  id: string;
  customerId: string;
  orderDate: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalAmount: number;
  shippingAddress: string;
  paymentMethod: string;
  notes: string;
  salesRepId: string;
  region: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Inventory {
  id: string;
  productId: string;
  warehouse: string;
  quantity: number;
  reorderLevel: number;
  lastUpdated: string;
}

export interface SalesRep {
  id: string;
  name: string;
  email: string;
  region: string;
  hireDate: string;
  performance: number;
}

export class DatabaseManager {
  private db!: Database.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'business_data.db');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new Database.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  private async createTables(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Customers table
    await run(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        company TEXT,
        industry TEXT,
        location TEXT,
        customer_tier TEXT CHECK(customer_tier IN ('bronze', 'silver', 'gold', 'platinum')),
        acquisition_date TEXT,
        total_spent REAL DEFAULT 0,
        last_order_date TEXT,
        status TEXT CHECK(status IN ('active', 'inactive', 'prospect')) DEFAULT 'active',
        notes TEXT
      )
    `);

    // Products table
    await run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        subcategory TEXT,
        price REAL NOT NULL,
        cost REAL NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        description TEXT,
        brand TEXT,
        weight REAL,
        dimensions TEXT,
        status TEXT CHECK(status IN ('active', 'discontinued', 'out_of_stock')) DEFAULT 'active',
        launch_date TEXT
      )
    `);

    // Sales reps table
    await run(`
      CREATE TABLE IF NOT EXISTS sales_reps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        region TEXT,
        hire_date TEXT,
        performance REAL DEFAULT 0
      )
    `);

    // Orders table
    await run(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        order_date TEXT,
        status TEXT CHECK(status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
        total_amount REAL,
        shipping_address TEXT,
        payment_method TEXT,
        notes TEXT,
        sales_rep_id TEXT,
        region TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers (id),
        FOREIGN KEY (sales_rep_id) REFERENCES sales_reps (id)
      )
    `);

    // Order items table
    await run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        product_id TEXT,
        quantity INTEGER,
        unit_price REAL,
        total_price REAL,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
      )
    `);

    // Inventory table
    await run(`
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        warehouse TEXT,
        quantity INTEGER,
        reorder_level INTEGER,
        last_updated TEXT,
        FOREIGN KEY (product_id) REFERENCES products (id)
      )
    `);

    // Create indexes for better performance
    await run(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id)`);
  }

  async seedSampleData(): Promise<void> {
    // For demo purposes, we'll skip the complex seeding
    // In a real implementation, you would populate the database with sample data
    console.log('Database initialized with sample schema');
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
