const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Get Branch by ID
const getBranchById = async (id) => {
  const branch = await prisma.branch.findUnique({
    where: { id },
    include: {
      Shop: true,
      Store: true,
      User: true,
    },
  });
  return branch;
};

// Get Branch by Name
const getBranchByName = async (name) => {
  const branch = await prisma.branch.findFirst({
    where: { name },
  });
  return branch;
};

// Get all Branches
const getAllBranches = async () => {
  const branches = await prisma.branch.findMany({
    orderBy: {
      name: 'asc',
    },
    include: {
      Shop: true,
      Store: true,
      User: true,
    },
  });

  return {
    branches,
    count: branches.length,
  };
};

// Create Branch
const createBranch = async (branchBody) => {
  // Check if branch with same name already exists
  if (await getBranchByName(branchBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch name already taken');
  }

  const branch = await prisma.branch.create({
    data: branchBody,
  });
  return branch;
};

// Update Branch
const updateBranch = async (id, updateBody) => {
  const existingBranch = await getBranchById(id);
  if (!existingBranch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Branch not found');
  }

  // Check if name is being updated to an existing branch name
  if (updateBody.name && updateBody.name !== existingBranch.name) {
    if (await getBranchByName(updateBody.name)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Branch name already taken');
    }
  }

  const updatedBranch = await prisma.branch.update({
    where: { id },
    data: updateBody,
    include: {
      Shop: true,
      Store: true,
      User: true,
    },
  });

  return updatedBranch;
};

// Delete Branch
const deleteBranch = async (id) => {
  const existingBranch = await getBranchById(id);
  if (!existingBranch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Branch not found');
  }

  await prisma.branch.delete({
    where: { id },
  });

  return { message: 'Branch deleted successfully' };
};

const getAllProducts = async (userId) => {
  // First, get user with shop access if userId is provided
  let userShops = [];
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        shops: {
          include: {
            branch: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    userShops = user?.shops || [];
  }

  // Get all branches, shops, and stores with their relationships
  const [branches, shops, stores] = await Promise.all([
    prisma.branch.findMany({
      select: { id: true, name: true },
    }),
    prisma.shop.findMany({
      include: {
        branch: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.store.findMany({
      include: {
        branch: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  // Create maps for easy lookup
  const branchMap = Object.fromEntries(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const shopMap = Object.fromEntries(shops.map((shop) => [shop.id, shop]));
  const storeMap = Object.fromEntries(stores.map((store) => [store.id, store]));

  // Build where clause based on user shop access
  const whereClause =
    userId && userShops.length > 0
      ? {
          OR: [
            // Include products that have stock in user's accessible shops
            {
              batches: {
                some: {
                  ShopStock: {
                    some: {
                      shopId: { in: userShops.map((shop) => shop.id) },
                      status: 'Available',
                    },
                  },
                },
              },
            },
            // Also include products with additional prices in user's shops
            {
              AdditionalPrice: {
                some: {
                  shopId: { in: userShops.map((shop) => shop.id) },
                },
              },
            },
          ],
        }
      : {};

  // Get all products with their stock information
  const products = await prisma.product.findMany({
    where: whereClause,
    orderBy: {
      name: 'asc',
    },
    include: {
      category: true,
      subCategory: true,
      unitOfMeasure: true,
      AdditionalPrice: {
        include: {
          shop: {
            include: {
              branch: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      batches: {
        include: {
          ShopStock: {
            where: { status: 'Available' },
            include: {
              shop: {
                include: {
                  branch: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
          StoreStock: {
            where: { status: 'Available' },
            include: {
              store: {
                include: {
                  branch: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Calculate detailed stock information for each product organized by branch
  const productsWithDetailedStock = products.map((product) => {
    const branchStocks = {};
    const batchStockDetails = [];

    let totalShopStock = 0;
    let totalStoreStock = 0;

    // Initialize all branches with empty shop and store structures
    branches.forEach((branch) => {
      branchStocks[branch.name] = {
        branchId: branch.id,
        shops: {},
        stores: {},
        totalShopStock: 0,
        totalStoreStock: 0,
        totalBranchStock: 0,
      };

      // Initialize shops for this branch
      shops
        .filter((shop) => shop.branchId === branch.id)
        .forEach((shop) => {
          branchStocks[branch.name].shops[shop.name] = 0;
        });

      // Initialize stores for this branch
      stores
        .filter((store) => store.branchId === branch.id)
        .forEach((store) => {
          branchStocks[branch.name].stores[store.name] = 0;
        });
    });

    // Calculate stock from all batches
    product.batches.forEach((batch) => {
      const batchBranchStocks = {};
      let batchTotalStock = 0;

      // Initialize branch structure for this batch
      branches.forEach((branch) => {
        batchBranchStocks[branch.name] = {
          shops: {},
          stores: {},
          totalStock: 0,
        };
      });

      // Process shop stock for this batch
      batch.ShopStock.forEach((shopStock) => {
        const { shop } = shopStock;
        const branchName = shop.branch.name;
        const { quantity } = shopStock;

        // Update main branch stocks
        branchStocks[branchName].shops[shop.name] =
          (branchStocks[branchName].shops[shop.name] || 0) + quantity;
        branchStocks[branchName].totalShopStock += quantity;
        branchStocks[branchName].totalBranchStock += quantity;

        // Update batch branch stocks
        batchBranchStocks[branchName].shops[shop.name] =
          (batchBranchStocks[branchName].shops[shop.name] || 0) + quantity;
        batchBranchStocks[branchName].totalStock += quantity;

        totalShopStock += quantity;
        batchTotalStock += quantity;
      });

      // Process store stock for this batch
      batch.StoreStock.forEach((storeStock) => {
        const { store } = storeStock;
        const branchName = store.branch.name;
        const { quantity } = storeStock;

        // Update main branch stocks
        branchStocks[branchName].stores[store.name] =
          (branchStocks[branchName].stores[store.name] || 0) + quantity;
        branchStocks[branchName].totalStoreStock += quantity;
        branchStocks[branchName].totalBranchStock += quantity;

        // Update batch branch stocks
        batchBranchStocks[branchName].stores[store.name] =
          (batchBranchStocks[branchName].stores[store.name] || 0) + quantity;
        batchBranchStocks[branchName].totalStock += quantity;

        totalStoreStock += quantity;
        batchTotalStock += quantity;
      });

      // Add batch stock details
      batchStockDetails.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        price: batch.price,
        branchStocks: batchBranchStocks,
        totalStock: batchTotalStock,
      });
    });

    const totalStock = totalShopStock + totalStoreStock;

    // Filter additional prices based on user shop access
    const filteredAdditionalPrices =
      userId && userShops.length > 0
        ? product.AdditionalPrice.filter(
            (price) =>
              !price.shopId ||
              userShops.some((shop) => shop.id === price.shopId),
          )
        : product.AdditionalPrice;

    return {
      ...product,
      AdditionalPrice: filteredAdditionalPrices,
      stockSummary: {
        branchStocks, // Organized by branch -> shops/stores
        totalShopStock,
        totalStoreStock,
        totalStock,
        batchStockDetails, // Detailed stock information per batch
      },
    };
  });

  // Calculate overall totals across all products organized by branch
  const overallTotals = {
    branchTotals: {},
    totalShopStock: 0,
    totalStoreStock: 0,
    totalAllStock: 0,
  };

  // Initialize branch totals structure
  branches.forEach((branch) => {
    overallTotals.branchTotals[branch.name] = {
      branchId: branch.id,
      shops: {},
      stores: {},
      totalShopStock: 0,
      totalStoreStock: 0,
      totalBranchStock: 0,
    };

    // Initialize shop totals for this branch
    shops
      .filter((shop) => shop.branchId === branch.id)
      .forEach((shop) => {
        overallTotals.branchTotals[branch.name].shops[shop.name] = 0;
      });

    // Initialize store totals for this branch
    stores
      .filter((store) => store.branchId === branch.id)
      .forEach((store) => {
        overallTotals.branchTotals[branch.name].stores[store.name] = 0;
      });
  });

  // Calculate totals across all products
  productsWithDetailedStock.forEach((product) => {
    Object.entries(product.stockSummary.branchStocks).forEach(
      ([branchName, branchData]) => {
        // Calculate shop-wise totals (filtered by user access if applicable)
        Object.entries(branchData.shops).forEach(([shopName, quantity]) => {
          if (userId && userShops.length > 0) {
            // Check if this shop is accessible to user
            const userShopNames = userShops.map((shop) => shop.name);
            if (userShopNames.includes(shopName)) {
              overallTotals.branchTotals[branchName].shops[shopName] =
                (overallTotals.branchTotals[branchName].shops[shopName] || 0) +
                quantity;
              overallTotals.branchTotals[branchName].totalShopStock += quantity;
              overallTotals.branchTotals[branchName].totalBranchStock +=
                quantity;
              overallTotals.totalShopStock += quantity;
              overallTotals.totalAllStock += quantity;
            }
          } else {
            overallTotals.branchTotals[branchName].shops[shopName] =
              (overallTotals.branchTotals[branchName].shops[shopName] || 0) +
              quantity;
            overallTotals.branchTotals[branchName].totalShopStock += quantity;
            overallTotals.branchTotals[branchName].totalBranchStock += quantity;
            overallTotals.totalShopStock += quantity;
            overallTotals.totalAllStock += quantity;
          }
        });

        // Calculate store-wise totals
        Object.entries(branchData.stores).forEach(([storeName, quantity]) => {
          overallTotals.branchTotals[branchName].stores[storeName] =
            (overallTotals.branchTotals[branchName].stores[storeName] || 0) +
            quantity;
          overallTotals.branchTotals[branchName].totalStoreStock += quantity;
          overallTotals.branchTotals[branchName].totalBranchStock += quantity;
          overallTotals.totalStoreStock += quantity;
          overallTotals.totalAllStock += quantity;
        });
      },
    );
  });

  // Add overallTotals to each product
  const productsWithTotals = productsWithDetailedStock.map((product) => ({
    ...product,
    overallTotals,
  }));

  return {
    products: productsWithTotals,
    count: products.length,
    userAccessibleShops: userShops.map((shop) => ({
      id: shop.id,
      name: shop.name,
      branch: {
        id: shop.branch.id,
        name: shop.branch.name,
      },
    })),
    // Overall totals are now included in each product
  };
};

module.exports = {
  getBranchById,
  getBranchByName,
  getAllBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getAllProducts,
};
