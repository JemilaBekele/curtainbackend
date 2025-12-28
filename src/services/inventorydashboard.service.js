/* eslint-disable no-underscore-dangle */
const prisma = require('./prisma');

class InventoryDashboardService {
  static async getInventoryDashboard() {
    try {
      return await prisma.$transaction(async (tx) => {
        const methods = [
          { name: '_getExpiringBatches', method: this._getExpiringBatches },
          { name: '_getLowStockAlerts', method: this._getLowStockAlerts },
          { name: '_getTopItemsByValue', method: this._getTopItemsByValue },
          {
            name: '_getInventoryAgingReport',
            method: this._getInventoryAgingReport,
          },
        ];

        const results = await Promise.all(
          methods.map(async ({ name, method }) => {
            try {
              const result = await method.call(this, tx);
              return result;
            } catch (error) {
              console.error(`❌ Error in ${name}:`, error.message, error.stack);
              throw error;
            }
          }),
        );

        const [expiringSoon, lowStockItems, topItems, agingReport] = results;

        const dashboardData = {
          alerts: {
            expiringSoon,
            lowStockItems,
          },
          tables: {
            topItems,
            agingReport,
          },
          lastUpdated: new Date(),
        };

        return dashboardData;
      });
    } catch (error) {
      console.error('❌ Transaction failed:', error.message, error.stack);
      throw error;
    } finally {
    }
  }

  static async _getExpiringBatches(tx, days = 365) {
    try {
      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      const result = await tx.$queryRaw`
      SELECT 
        pb._id as batchId,
        pb.batchNumber,
        pb.expiryDate,
        pb.price as unitPrice,
        p.sellPrice,
        p.name as productName,
        p.productCode,
        c.name as categoryName,
        COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0) as totalQuantity
      FROM product_batches pb
      INNER JOIN products p ON pb.productId = p._id
      INNER JOIN categories c ON p.categoryId = c._id
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM store_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as store_stock ON pb._id = store_stock.batchId
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM shop_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as shop_stock ON pb._id = shop_stock.batchId
      WHERE pb.expiryDate IS NOT NULL
        AND pb.expiryDate BETWEEN ${now} AND ${expiryDate}
        AND (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) > 0
      GROUP BY pb._id, pb.batchNumber, pb.expiryDate, pb.price, p.sellPrice, p.name, p.productCode, c.name
      ORDER BY pb.expiryDate ASC
    `;

      // Calculate days until expiry in JavaScript for better compatibility
      const formattedResult = result.map(item => ({
        ...item,
        daysUntilExpiry: item.expiryDate 
          ? Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
          : null
      }));

      return formattedResult;
    } catch (error) {
      console.error(
        '❌ _getExpiringBatches failed:',
        error.message,
        error.stack,
      );
      throw error;
    }
  }

  static async _getLowStockAlerts(tx) {
    try {
      const result = await tx.$queryRaw`
      SELECT 
        p._id,
        p.name as productName,
        p.productCode,
        pb.batchNumber,
        pb.warningQuantity,
        COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0) as currentStock,
        c.name as categoryName
      FROM products p
      INNER JOIN product_batches pb ON p._id = pb.productId
      INNER JOIN categories c ON p.categoryId = c._id
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM store_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as store_stock ON pb._id = store_stock.batchId
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM shop_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as shop_stock ON pb._id = shop_stock.batchId
      WHERE pb.warningQuantity IS NOT NULL 
        AND pb.warningQuantity > 0
        AND (
          (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) <= pb.warningQuantity
          OR (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) = 0
        )
      GROUP BY p._id, p.name, p.productCode, pb.batchNumber, pb.warningQuantity, c.name
      ORDER BY 
        CASE 
          WHEN (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) = 0 THEN 0
          ELSE (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) / pb.warningQuantity
        END ASC,
        pb.warningQuantity DESC
    `;

      // Calculate alert type and percentage in JavaScript for better compatibility
      const formattedResult = result.map(item => {
        const alertType = item.currentStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK';
        const stockPercentage = item.warningQuantity > 0 
          ? Math.round((item.currentStock * 100.0) / item.warningQuantity * 100) / 100
          : 0;

        return {
          ...item,
          alertType,
          stockPercentage
        };
      });

      return formattedResult;
    } catch (error) {
      console.error(
        '❌ _getLowStockAlerts failed:',
        error.message,
        error.stack,
      );
      throw error;
    }
  }

  static async _getTopItemsByValue(tx, limit = 10) {
    try {
      const result = await tx.$queryRaw`
      SELECT 
        p._id,
        p.name as productName,
        p.productCode,
        c.name as category,
        SUM(COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) as totalQuantity,
        SUM(pb.price * (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0))) as totalCostValue,
        SUM(p.sellPrice * (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0))) as totalRetailValue
      FROM products p
      INNER JOIN categories c ON p.categoryId = c._id
      INNER JOIN product_batches pb ON p._id = pb.productId
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM store_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as store_stock ON pb._id = store_stock.batchId
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM shop_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as shop_stock ON pb._id = shop_stock.batchId
      WHERE (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) > 0
      GROUP BY p._id, p.name, p.productCode, c.name
      ORDER BY totalCostValue DESC
      LIMIT ${limit}
    `;

      return result;
    } catch (error) {
      console.error(
        '❌ _getTopItemsByValue failed:',
        error.message,
        error.stack,
      );
      throw error;
    }
  }

  static async _getInventoryAgingReport(tx) {
    try {
      // First, let's check what database functions are available
      // Use a simpler approach that works across databases
      const result = await tx.$queryRaw`
      SELECT 
        p._id,
        p.name as productName,
        p.productCode,
        pb.batchNumber,
        pb.createdAt as batchDate,
        COALESCE(SUM(store_stock.total_qty), 0) + COALESCE(SUM(shop_stock.total_qty), 0) as quantity,
        pb.createdAt,
        SUM(pb.price * (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0))) as inventoryValue,
        c.name as categoryName
      FROM product_batches pb
      INNER JOIN products p ON pb.productId = p._id
      INNER JOIN categories c ON p.categoryId = c._id
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM store_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as store_stock ON pb._id = store_stock.batchId
      LEFT JOIN (
        SELECT batchId, SUM(quantity) as total_qty 
        FROM shop_stocks 
        WHERE status = 'Available'
        GROUP BY batchId
      ) as shop_stock ON pb._id = shop_stock.batchId
      WHERE (COALESCE(store_stock.total_qty, 0) + COALESCE(shop_stock.total_qty, 0)) > 0
      GROUP BY p._id, p.name, p.productCode, pb.batchNumber, pb.createdAt, c.name
      ORDER BY pb.createdAt ASC
    `;

      // Calculate days in inventory in JavaScript for better compatibility
      const now = new Date();
      const formattedResult = result.map(item => {
        const batchDate = new Date(item.batchDate);
        const daysInInventory = Math.floor((now - batchDate) / (1000 * 60 * 60 * 24));
        
        return {
          id: item._id,
          productName: item.productName,
          productCode: item.productCode,
          batchNumber: item.batchNumber,
          batchDate: item.batchDate,
          quantity: item.quantity,
          daysInInventory: daysInInventory >= 0 ? daysInInventory : 0,
          inventoryValue: item.inventoryValue,
          categoryName: item.categoryName
        };
      });

      // Sort by days in inventory descending (oldest first)
      formattedResult.sort((a, b) => b.daysInInventory - a.daysInInventory);

      console.log('✅ _getInventoryAgingReport success:', {
        recordCount: formattedResult?.length,
        sampleDates: formattedResult.slice(0, 3).map(r => ({
          product: r.productName,
          batchDate: r.batchDate,
          days: r.daysInInventory
        }))
      });

      return formattedResult;
    } catch (error) {
      console.error(
        '❌ _getInventoryAgingReport failed:',
        error.message,
        error.stack,
      );
      throw error;
    }
  }
}

module.exports = InventoryDashboardService;