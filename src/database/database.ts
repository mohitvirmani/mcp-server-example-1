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
    // Check if data already exists
    const existingCustomers = await new Promise<any>((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM customers', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existingCustomers.count > 0) {
      console.log('Sample data already exists');
      return;
    }

    console.log('Adding sample data...');

    // Sample customers
    const customers = [
      {
        id: 'CUST001',
        name: 'John Smith',
        email: 'john.smith@techcorp.com',
        phone: '+1-555-0101',
        company: 'TechCorp Solutions',
        industry: 'Technology',
        location: 'San Francisco, CA',
        customerTier: 'platinum',
        acquisitionDate: '2022-01-15',
        totalSpent: 125000,
        lastOrderDate: '2024-01-10',
        status: 'active',
        notes: 'High-value enterprise client'
      },
      {
        id: 'CUST002',
        name: 'Sarah Johnson',
        email: 'sarah.j@retailplus.com',
        phone: '+1-555-0102',
        company: 'RetailPlus Inc',
        industry: 'Retail',
        location: 'New York, NY',
        customerTier: 'gold',
        acquisitionDate: '2022-06-20',
        totalSpent: 85000,
        lastOrderDate: '2024-01-08',
        status: 'active',
        notes: 'Growing retail chain'
      },
      {
        id: 'CUST003',
        name: 'Michael Chen',
        email: 'm.chen@manufacturing.com',
        phone: '+1-555-0103',
        company: 'Manufacturing Co',
        industry: 'Manufacturing',
        location: 'Detroit, MI',
        customerTier: 'silver',
        acquisitionDate: '2023-03-10',
        totalSpent: 45000,
        lastOrderDate: '2023-12-15',
        status: 'active',
        notes: 'Industrial equipment supplier'
      },
      {
        id: 'CUST004',
        name: 'Emily Davis',
        email: 'emily@healthcare.org',
        phone: '+1-555-0104',
        company: 'Healthcare Systems',
        industry: 'Healthcare',
        location: 'Boston, MA',
        customerTier: 'gold',
        acquisitionDate: '2022-09-05',
        totalSpent: 95000,
        lastOrderDate: '2024-01-05',
        status: 'active',
        notes: 'Medical equipment provider'
      },
      {
        id: 'CUST005',
        name: 'Robert Wilson',
        email: 'r.wilson@finance.com',
        phone: '+1-555-0105',
        company: 'Finance First',
        industry: 'Finance',
        location: 'Chicago, IL',
        customerTier: 'bronze',
        acquisitionDate: '2023-11-20',
        totalSpent: 15000,
        lastOrderDate: '2023-12-20',
        status: 'prospect',
        notes: 'New financial services client'
      }
    ];

    // Sample products
    const products = [
      {
        id: 'PROD001',
        name: 'Enterprise Server Pro',
        category: 'Hardware',
        subcategory: 'Servers',
        price: 15000,
        cost: 10000,
        sku: 'ESP-2024-001',
        description: 'High-performance enterprise server',
        brand: 'TechBrand',
        weight: 25.5,
        dimensions: '19x24x36 inches',
        status: 'active',
        launchDate: '2023-01-15'
      },
      {
        id: 'PROD002',
        name: 'Business Software Suite',
        category: 'Software',
        subcategory: 'Business Applications',
        price: 2500,
        cost: 500,
        sku: 'BSS-2024-002',
        description: 'Comprehensive business management software',
        brand: 'SoftCorp',
        weight: 0.1,
        dimensions: 'Digital',
        status: 'active',
        launchDate: '2023-03-20'
      },
      {
        id: 'PROD003',
        name: 'Network Security Appliance',
        category: 'Hardware',
        subcategory: 'Security',
        price: 8500,
        cost: 5500,
        sku: 'NSA-2024-003',
        description: 'Advanced network security solution',
        brand: 'SecureTech',
        weight: 12.3,
        dimensions: '17x19x3 inches',
        status: 'active',
        launchDate: '2023-06-10'
      },
      {
        id: 'PROD004',
        name: 'Cloud Storage Service',
        category: 'Services',
        subcategory: 'Cloud Computing',
        price: 500,
        cost: 200,
        sku: 'CSS-2024-004',
        description: 'Scalable cloud storage solution',
        brand: 'CloudMax',
        weight: 0,
        dimensions: 'Virtual',
        status: 'active',
        launchDate: '2023-02-28'
      },
      {
        id: 'PROD005',
        name: 'Data Analytics Platform',
        category: 'Software',
        subcategory: 'Analytics',
        price: 12000,
        cost: 3000,
        sku: 'DAP-2024-005',
        description: 'Advanced data analytics and visualization',
        brand: 'DataViz',
        weight: 0.2,
        dimensions: 'Digital',
        status: 'active',
        launchDate: '2023-04-15'
      }
    ];

    // Sample sales reps
    const salesReps = [
      {
        id: 'REP001',
        name: 'Alice Thompson',
        email: 'alice.thompson@company.com',
        region: 'West Coast',
        hireDate: '2021-03-15',
        performance: 95.5
      },
      {
        id: 'REP002',
        name: 'David Rodriguez',
        email: 'david.rodriguez@company.com',
        region: 'East Coast',
        hireDate: '2022-01-10',
        performance: 88.2
      },
      {
        id: 'REP003',
        name: 'Lisa Park',
        email: 'lisa.park@company.com',
        region: 'Midwest',
        hireDate: '2021-11-20',
        performance: 92.7
      }
    ];

    // Insert sample data using Promise-based approach
    for (const customer of customers) {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`
          INSERT INTO customers (id, name, email, phone, company, industry, location, customer_tier, acquisition_date, total_spent, last_order_date, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [customer.id, customer.name, customer.email, customer.phone, customer.company,
          customer.industry, customer.location, customer.customerTier, customer.acquisitionDate,
          customer.totalSpent, customer.lastOrderDate, customer.status, customer.notes], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    for (const product of products) {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`
          INSERT INTO products (id, name, category, subcategory, price, cost, sku, description, brand, weight, dimensions, status, launch_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [product.id, product.name, product.category, product.subcategory, product.price,
          product.cost, product.sku, product.description, product.brand, product.weight,
          product.dimensions, product.status, product.launchDate], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    for (const rep of salesReps) {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`
          INSERT INTO sales_reps (id, name, email, region, hire_date, performance)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [rep.id, rep.name, rep.email, rep.region, rep.hireDate, rep.performance], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Sample orders
    const orders = [
      {
        id: 'ORD001',
        customerId: 'CUST001',
        orderDate: '2024-01-10',
        status: 'delivered',
        totalAmount: 45000,
        shippingAddress: '123 Tech Street, San Francisco, CA 94105',
        paymentMethod: 'Corporate Credit Card',
        notes: 'Rush order for Q1 expansion',
        salesRepId: 'REP001',
        region: 'West Coast'
      },
      {
        id: 'ORD002',
        customerId: 'CUST002',
        orderDate: '2024-01-08',
        status: 'shipped',
        totalAmount: 25000,
        shippingAddress: '456 Retail Ave, New York, NY 10001',
        paymentMethod: 'Purchase Order',
        notes: 'Standard delivery',
        salesRepId: 'REP002',
        region: 'East Coast'
      },
      {
        id: 'ORD003',
        customerId: 'CUST003',
        orderDate: '2023-12-15',
        status: 'delivered',
        totalAmount: 18000,
        shippingAddress: '789 Industrial Blvd, Detroit, MI 48201',
        paymentMethod: 'Wire Transfer',
        notes: 'Bulk order discount applied',
        salesRepId: 'REP003',
        region: 'Midwest'
      }
    ];

    for (const order of orders) {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`
          INSERT INTO orders (id, customer_id, order_date, status, total_amount, shipping_address, payment_method, notes, sales_rep_id, region)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [order.id, order.customerId, order.orderDate, order.status, order.totalAmount,
          order.shippingAddress, order.paymentMethod, order.notes, order.salesRepId, order.region], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Sample order items
    const orderItems = [
      { id: 'ITEM001', orderId: 'ORD001', productId: 'PROD001', quantity: 2, unitPrice: 15000, totalPrice: 30000 },
      { id: 'ITEM002', orderId: 'ORD001', productId: 'PROD002', quantity: 6, unitPrice: 2500, totalPrice: 15000 },
      { id: 'ITEM003', orderId: 'ORD002', productId: 'PROD003', quantity: 2, unitPrice: 8500, totalPrice: 17000 },
      { id: 'ITEM004', orderId: 'ORD002', productId: 'PROD004', quantity: 16, unitPrice: 500, totalPrice: 8000 },
      { id: 'ITEM005', orderId: 'ORD003', productId: 'PROD005', quantity: 1, unitPrice: 12000, totalPrice: 12000 },
      { id: 'ITEM006', orderId: 'ORD003', productId: 'PROD002', quantity: 2, unitPrice: 2500, totalPrice: 5000 },
      { id: 'ITEM007', orderId: 'ORD003', productId: 'PROD004', quantity: 1, unitPrice: 500, totalPrice: 500 }
    ];

    for (const item of orderItems) {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`
          INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [item.id, item.orderId, item.productId, item.quantity, item.unitPrice, item.totalPrice], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Sample inventory
    const inventory = [
      { id: 'INV001', productId: 'PROD001', warehouse: 'West Coast', quantity: 15, reorderLevel: 5, lastUpdated: '2024-01-15' },
      { id: 'INV002', productId: 'PROD002', warehouse: 'Central', quantity: 100, reorderLevel: 20, lastUpdated: '2024-01-15' },
      { id: 'INV003', productId: 'PROD003', warehouse: 'East Coast', quantity: 8, reorderLevel: 3, lastUpdated: '2024-01-15' },
      { id: 'INV004', productId: 'PROD004', warehouse: 'Cloud', quantity: 999, reorderLevel: 50, lastUpdated: '2024-01-15' },
      { id: 'INV005', productId: 'PROD005', warehouse: 'Central', quantity: 12, reorderLevel: 4, lastUpdated: '2024-01-15' }
    ];

    for (const inv of inventory) {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`
          INSERT INTO inventory (id, product_id, warehouse, quantity, reorder_level, last_updated)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [inv.id, inv.productId, inv.warehouse, inv.quantity, inv.reorderLevel, inv.lastUpdated], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    console.log('Sample data added successfully!');
    console.log(`- ${customers.length} customers`);
    console.log(`- ${products.length} products`);
    console.log(`- ${salesReps.length} sales reps`);
    console.log(`- ${orders.length} orders`);
    console.log(`- ${orderItems.length} order items`);
    console.log(`- ${inventory.length} inventory items`);
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
