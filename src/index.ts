#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DatabaseManager } from './database/database.js';
import { AnalyticsEngine } from './analytics/analytics.js';
import { SecurityManager } from './security/security.js';
import { ReportGenerator } from './reports/reportGenerator.js';
import { CustomerService } from './services/customerService.js';
import { InventoryService } from './services/inventoryService.js';
import { SalesService } from './services/salesService.js';

// Initialize services (will be initialized after database is ready)
let dbManager: DatabaseManager;
let analyticsEngine: AnalyticsEngine;
let securityManager: SecurityManager;
let reportGenerator: ReportGenerator;
let customerService: CustomerService;
let inventoryService: InventoryService;
let salesService: SalesService;

// Define comprehensive tool schema
const BusinessIntelligenceToolSchema = z.object({
  operation: z.enum([
    'get_customer_analytics',
    'get_sales_performance',
    'get_inventory_insights',
    'generate_business_report',
    'predict_sales_trends',
    'analyze_customer_behavior',
    'get_revenue_forecast',
    'identify_top_products',
    'analyze_market_segments',
    'get_operational_metrics',
    'search_customers',
    'get_customer_details',
    'update_customer_info',
    'check_inventory_levels',
    'get_product_performance',
    'create_sales_opportunity',
    'get_order_analytics',
    'analyze_geographic_sales',
    'get_financial_summary',
    'export_data'
  ]),
  parameters: z.record(z.any()).optional(),
  filters: z.record(z.any()).optional(),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional()
  }).optional(),
  format: z.enum(['json', 'csv', 'pdf']).optional()
});

class BusinessIntelligenceMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'business-intelligence-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAvailableTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        // Validate and authenticate request
        await securityManager.validateRequest(request);
        
        // Parse and validate arguments
        const validatedArgs = BusinessIntelligenceToolSchema.parse(args);
        
        // Route to appropriate service
        const result = await this.routeRequest(name, validatedArgs);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async routeRequest(toolName: string, args: any) {
    const { operation, parameters = {}, filters = {}, dateRange, format = 'json' } = args;

    switch (operation) {
      case 'get_customer_analytics':
        return await analyticsEngine.getCustomerAnalytics(filters, dateRange);
      
      case 'get_sales_performance':
        return await analyticsEngine.getSalesPerformance(filters, dateRange);
      
      case 'get_inventory_insights':
        return await analyticsEngine.getInventoryInsights(filters);
      
      case 'generate_business_report':
        return await reportGenerator.generateComprehensiveReport(filters, dateRange, format);
      
      case 'predict_sales_trends':
        return await analyticsEngine.predictSalesTrends(filters, dateRange);
      
      case 'analyze_customer_behavior':
        return await analyticsEngine.analyzeCustomerBehavior(filters, dateRange);
      
      case 'get_revenue_forecast':
        return await analyticsEngine.getRevenueForecast(filters, dateRange);
      
      case 'identify_top_products':
        return await analyticsEngine.identifyTopProducts(filters, dateRange);
      
      case 'analyze_market_segments':
        return await analyticsEngine.analyzeMarketSegments(filters, dateRange);
      
      case 'get_operational_metrics':
        return await analyticsEngine.getOperationalMetrics(filters, dateRange);
      
      case 'search_customers':
        return await customerService.searchCustomers(parameters);
      
      case 'get_customer_details':
        return await customerService.getCustomerDetails(parameters.customerId);
      
      case 'update_customer_info':
        return await customerService.updateCustomerInfo(parameters.customerId, parameters.data);
      
      case 'check_inventory_levels':
        return await inventoryService.checkInventoryLevels(parameters);
      
      case 'get_product_performance':
        return await inventoryService.getProductPerformance(filters, dateRange);
      
      case 'create_sales_opportunity':
        return await salesService.createSalesOpportunity(parameters);
      
      case 'get_order_analytics':
        return await salesService.getOrderAnalytics(filters, dateRange);
      
      case 'analyze_geographic_sales':
        return await analyticsEngine.analyzeGeographicSales(filters, dateRange);
      
      case 'get_financial_summary':
        return await analyticsEngine.getFinancialSummary(filters, dateRange);
      
      case 'export_data':
        return await reportGenerator.exportData(parameters, format);
      
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private getAvailableTools(): Tool[] {
    return [
      {
        name: 'business_intelligence',
        description: 'Comprehensive business intelligence and analytics tool for enterprise data analysis',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: [
                'get_customer_analytics',
                'get_sales_performance', 
                'get_inventory_insights',
                'generate_business_report',
                'predict_sales_trends',
                'analyze_customer_behavior',
                'get_revenue_forecast',
                'identify_top_products',
                'analyze_market_segments',
                'get_operational_metrics',
                'search_customers',
                'get_customer_details',
                'update_customer_info',
                'check_inventory_levels',
                'get_product_performance',
                'create_sales_opportunity',
                'get_order_analytics',
                'analyze_geographic_sales',
                'get_financial_summary',
                'export_data'
              ],
              description: 'The specific business intelligence operation to perform'
            },
            parameters: {
              type: 'object',
              description: 'Operation-specific parameters'
            },
            filters: {
              type: 'object',
              description: 'Filters to apply to the data analysis'
            },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                end: { type: 'string', description: 'End date (YYYY-MM-DD)' }
              },
              description: 'Date range for analysis'
            },
            format: {
              type: 'string',
              enum: ['json', 'csv', 'pdf'],
              description: 'Output format for reports'
            }
          },
          required: ['operation']
        }
      }
    ];
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    // Initialize database and sample data
    dbManager = new DatabaseManager();
    await dbManager.initialize();
    await dbManager.seedSampleData();
    
    // Initialize services after database is ready
    analyticsEngine = new AnalyticsEngine(dbManager);
    securityManager = new SecurityManager();
    reportGenerator = new ReportGenerator(dbManager, analyticsEngine);
    customerService = new CustomerService(dbManager);
    inventoryService = new InventoryService(dbManager);
    salesService = new SalesService(dbManager);
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Business Intelligence MCP Server running on stdio');
  }
}

// Start the server
const server = new BusinessIntelligenceMCPServer();
server.run().catch(console.error);
