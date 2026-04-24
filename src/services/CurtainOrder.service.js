/* eslint-disable no-await-in-loop */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-restricted-syntax */
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

/* ──────────────── CURTAIN ORDER ──────────────── */

// Get CurtainOrder by ID
const getCurtainOrderById = async (id) => {
  const curtainOrder = await prisma.curtainOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      Shop: true,
      movementType: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      // Add curtain measurements here
      measurements: {
        include: {
          thickProduct: true,
          thinProduct: true,
          curtainPole: true,
          curtainPulls: true,
          curtainBrackets: true,
          shatterVerticalProduct: true,
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          thickWorker: {
            select: {
              id: true,
              name: true,
            },
          },
          thinWorker: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  return curtainOrder;
};
const getPendingCurtainOrders = async () => {
  try {
    const curtainOrders = await prisma.curtainOrder.findMany({
      where: {
        curtainStatus: {
          not: 'DELIVERED', // Only orders not delivered
        },
        deliveryDeadline: {
          not: null, // Must have a delivery date
        },
      },
      orderBy: {
        deliveryDeadline: 'asc', // Soonest delivery first
      },
      include: {
        customer: true,
        Shop: true,
        movementType: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        measurements: {
          include: {
            thickProduct: true,
            thinProduct: true,
            curtainPole: true,
            curtainPulls: true,
            curtainBrackets: true,
            shatterVerticalProduct: true,
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            thickWorker: {
              select: {
                id: true,
                name: true,
              },
            },
            thinWorker: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    return curtainOrders;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch pending curtain orders',
    );
  }
};
const getthikthinCurtainOrderById = async (id) => {
  const curtainOrder = await prisma.curtainOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      Shop: true,
      movementType: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      // Only include measurements WITHOUT shatterVerticalProductId
      measurements: {
        where: {
          shatterVerticalProductId: {
            equals: null, // Use equals instead of isNull
          },
        },
        include: {
          thickProduct: true,
          thinProduct: true,
          curtainPole: true,
          curtainPulls: true,
          curtainBrackets: true,
          // If you still want to include shatterVerticalProduct (though it will be null)
          shatterVerticalProduct: true,
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          thickWorker: {
            select: {
              id: true,
              name: true,
            },
          },
          thinWorker: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  return curtainOrder;
};
// getthikthinCurtainOrderById,getshatterCurtainOrderById
const getshatterCurtainOrderById = async (id) => {
  const curtainOrder = await prisma.curtainOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      Shop: true,
      movementType: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      // Only include measurements where shatterVerticalProductId exists
      measurements: {
        where: {
          shatterVerticalProductId: {
            not: null,
          },
        },
        include: {
          // Only include shatterVerticalProduct and basic relations
          shatterVerticalProduct: true,
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  return curtainOrder;
};

// Get CurtainOrder by criteria
const getCurtainOrderByCriteria = async (criteria) => {
  const curtainOrder = await prisma.curtainOrder.findFirst({
    where: criteria,
    include: {
      customer: true,
      movementType: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  return curtainOrder;
};

// Create CurtainOrder
const createCurtainOrder = async (curtainOrderData, createdById) => {
  const {
    customerId,
    movementTypeId,
    isSiteMeasured = false,
    siteMeasurePrice,
    remark,
    issueDate,
  } = curtainOrderData;

  // Validate required fields
  if (!customerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Customer ID is required');
  }

  // Check if customer exists
  const customerExists = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customerExists) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Customer not found');
  }

  // Check movement type
  if (movementTypeId) {
    const movementTypeExists = await prisma.movementType.findUnique({
      where: { id: movementTypeId },
    });

    if (!movementTypeExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Movement type not found');
    }
  }

  // Generate Auto Code
  const lastOrder = await prisma.curtainOrder.findFirst({
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      code: true,
    },
  });

  let newCode = 'CO-0001';

  if (lastOrder?.code) {
    const lastNumber = parseInt(lastOrder.code.split('-')[1], 10);
    const nextNumber = lastNumber + 1;
    newCode = `CO-${String(nextNumber).padStart(4, '0')}`;
  }

  // Parse issueDate
  let parsedIssueDate = null;
  if (issueDate) {
    parsedIssueDate = new Date(issueDate);
    if (Number.isNaN(parsedIssueDate.getTime())) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid issue date');
    }
  }

  const data = {
    code: newCode, // 👈 auto generated code
    customerId,
    movementTypeId: movementTypeId || null,
    isSiteMeasured,
    siteMeasurePrice:
      siteMeasurePrice !== undefined ? parseFloat(siteMeasurePrice) : null,
    remark: remark || null,
    issueDate: parsedIssueDate,
    createdById: createdById || null,
  };

  return prisma.curtainOrder.create({
    data,
    include: {
      customer: true,
      movementType: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
};

// Get all CurtainOrders
const getAllCurtainOrders = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    customerId,
    movementTypeId,
    isSiteMeasured,
    startDate,
    endDate,
    includeItems = false,
  } = options;

  const skip = (page - 1) * limit;

  const where = {};

  // Search filter
  if (search) {
    where.OR = [
      {
        customer: {
          name: { contains: search, mode: 'insensitive' },
        },
      },
      {
        customer: {
          phone1: { contains: search, mode: 'insensitive' },
        },
      },
      {
        remark: { contains: search, mode: 'insensitive' },
      },
    ];
  }

  // Customer filter
  if (customerId) {
    where.customerId = customerId;
  }

  // Movement type filter
  if (movementTypeId) {
    where.movementTypeId = movementTypeId;
  }

  // Site measured filter
  if (isSiteMeasured !== undefined) {
    where.isSiteMeasured = isSiteMeasured === 'true' || isSiteMeasured === true;
  }

  // Date range filter
  if (startDate || endDate) {
    where.issueDate = {};
    if (startDate) {
      where.issueDate.gte = new Date(startDate);
    }
    if (endDate) {
      where.issueDate.lte = new Date(endDate);
    }
  }

  const include = {
    customer: true,
    movementType: true,
    createdBy: {
      select: {
        id: true,
        name: true,
      },
    },
  };

  if (includeItems) {
    include.curtainOrderItems = true;
  }

  const [curtainOrders, totalCount] = await Promise.all([
    prisma.curtainOrder.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.curtainOrder.count({ where }),
  ]);

  return {
    curtainOrders,
    count: curtainOrders.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
  };
};

// Update CurtainOrder
const updateCurtainOrder = async (id, updateBody) => {
  const existing = await getCurtainOrderById(id);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  const {
    customerId,
    movementTypeId,
    isSiteMeasured,
    siteMeasurePrice,
    remark,
    issueDate,
  } = updateBody;

  // Validate customer if being updated
  if (customerId && customerId !== existing.customerId) {
    const customerExists = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customerExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Customer not found');
    }
  }

  // Validate movement type if being updated
  if (movementTypeId !== undefined) {
    if (movementTypeId && movementTypeId !== existing.movementTypeId) {
      const movementTypeExists = await prisma.movementType.findUnique({
        where: { id: movementTypeId },
      });
      if (!movementTypeExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Movement type not found');
      }
    }
  }

  // Validate siteMeasurePrice if provided
  if (siteMeasurePrice !== undefined && siteMeasurePrice !== null) {
    const price = parseFloat(siteMeasurePrice);
    if (Number.isNaN(price) || price < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid site measure price');
    }
  }

  // Parse issueDate if provided
  let parsedIssueDate;
  if (issueDate !== undefined) {
    if (issueDate === null) {
      parsedIssueDate = null;
    } else if (issueDate) {
      parsedIssueDate = new Date(issueDate);
      if (Number.isNaN(parsedIssueDate.getTime())) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid issue date');
      }
    }
  }

  // Prepare update data
  const updateData = {};

  if (customerId !== undefined) updateData.customerId = customerId;
  if (movementTypeId !== undefined)
    updateData.movementTypeId = movementTypeId || null;
  if (isSiteMeasured !== undefined)
    updateData.isSiteMeasured =
      isSiteMeasured === 'true' || isSiteMeasured === true;
  if (siteMeasurePrice !== undefined)
    updateData.siteMeasurePrice =
      siteMeasurePrice !== null ? parseFloat(siteMeasurePrice) : null;
  if (remark !== undefined) updateData.remark = remark || null;
  if (issueDate !== undefined) updateData.issueDate = parsedIssueDate;

  return prisma.curtainOrder.update({
    where: { id },
    data: updateData,
    include: {
      customer: true,
      movementType: true,
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
};

// Delete CurtainOrder
const deleteCurtainOrder = async (id) => {
  const existing = await getCurtainOrderById(id);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  // Check if there are any items associated
  const itemsCount = await prisma.curtainOrderItem.count({
    where: { curtainOrderId: id },
  });

  if (itemsCount > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot delete curtain order. It has ${itemsCount} item(s) associated with it.`,
    );
  }

  await prisma.curtainOrder.delete({ where: { id } });
  return { message: 'Curtain order deleted successfully' };
};

// Get curtain orders by customer
const getCurtainOrdersByCustomerId = async (customerId, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const where = { customerId };

  const [curtainOrders, totalCount] = await Promise.all([
    prisma.curtainOrder.findMany({
      where,
      include: {
        movementType: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.curtainOrder.count({ where }),
  ]);

  return {
    curtainOrders,
    count: curtainOrders.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
  };
};

// Get curtain orders created by user
const getCurtainOrdersByCreatedBy = async (createdById, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const where = { createdById };

  const [curtainOrders, totalCount] = await Promise.all([
    prisma.curtainOrder.findMany({
      where,
      include: {
        customer: true,
        movementType: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.curtainOrder.count({ where }),
  ]);

  return {
    curtainOrders,
    count: curtainOrders.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
  };
};

const createCurtainMeasurement = async (
  orderId,
  curtainMeasurementData,
  createdById,
  shopId,
) => {
  try {
    // Check if curtainMeasurementData is an array and extract the first element
    let measurementData;
    if (Array.isArray(curtainMeasurementData)) {
      if (curtainMeasurementData.length === 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'No measurement data provided',
        );
      }
      measurementData = curtainMeasurementData[0];
    } else {
      measurementData = curtainMeasurementData;
    }

    const {
      roomName,
      width,
      height,
      curtainSize,
      quantity,
      size,

      thickProductId,
      thickVariant,
      thickMeter,
      thickPrice,

      thinProductId,
      thinVariant,
      thinMeter,
      thinPrice,

      curtainPoleId,
      curtainPoleQuantity,
      curtainPolePrice,

      curtainPullsId,
      curtainPullsQuantity,

      curtainBracketsId,
      curtainBracketsQuantity,
      curtainPullsBracketsPrice,

      thickWorkerId,
      thinWorkerId,
      workerPrice,
      totalWorkerMeter,

      price,
      remark,
    } = measurementData;

    /* ---------------- REQUIRED FIELD VALIDATION ---------------- */

    if (!orderId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
    }

    if (!roomName) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Room name is required');
    }

    if (width === undefined || width === null) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Width is required');
    }

    if (height === undefined || height === null) {
      console.error('❌ Missing height');
      throw new ApiError(httpStatus.BAD_REQUEST, 'Height is required');
    }

    /* ---------------- ORDER CHECK ---------------- */

    const orderExists = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
    });

    if (!orderExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order not found');
    }

    /* ---------------- SHOP VALIDATION (if provided) ---------------- */
    if (shopId) {
      const shopExists = await prisma.shop.findUnique({
        where: { id: shopId },
      });

      if (!shopExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Shop not found');
      }
    }

    /* ---------------- PRODUCT CHECKS ---------------- */
    const checkProduct = async (id, label) => {
      if (!id) return;

      const exists = await prisma.product.findUnique({ where: { id } });

      if (!exists) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${label} product not found`,
        );
      }
    };

    await checkProduct(thickProductId, 'Thick curtain');
    await checkProduct(thinProductId, 'Thin curtain');
    await checkProduct(curtainPoleId, 'Curtain pole');
    await checkProduct(curtainPullsId, 'Curtain pulls');
    await checkProduct(curtainBracketsId, 'Curtain brackets');

    /* ---------------- WORKER CHECKS ---------------- */
    const checkWorker = async (id, label) => {
      if (!id) return;
      console.log(`🔍 Checking ${label} worker:`, id);

      const exists = await prisma.user.findUnique({ where: { id } });
      console.log(`👷 ${label} worker exists:`, exists);

      if (!exists) {
        throw new ApiError(httpStatus.BAD_REQUEST, `${label} worker not found`);
      }
    };

    await checkWorker(thickWorkerId, 'Thick');
    await checkWorker(thinWorkerId, 'Thin');

    /* ---------------- NUMERIC VALIDATION ---------------- */
    console.log('🔢 Validating numeric values');

    const numericWidth = parseFloat(width);
    const numericHeight = parseFloat(height);

    console.log('➡️ Parsed width/height:', numericWidth, numericHeight);

    if (Number.isNaN(numericWidth) || numericWidth <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid width value');
    }

    if (Number.isNaN(numericHeight) || numericHeight <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid height value');
    }

    // Optional: Validate size enum value if provided
    if (size && !['TWO_POINT_FIVE', 'THREE', 'NORMAL'].includes(size)) {
      console.error('❌ Invalid size value:', size);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid size value. Must be TWO_POINT_FIVE, THREE, or NORMAL',
      );
    }

    if (!thickProductId && !thinProductId) {
      console.error('❌ No curtain product selected');
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'At least one curtain product (thick or thin) must be selected',
      );
    }

    /* ---------------- UPDATE CURTAIN ORDER WITH SHOP ID ---------------- */
    if (shopId) {
      console.log('🔄 Updating curtain order with shopId:', shopId);

      await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          ShopId: shopId,
          updatedAt: new Date(),
        },
      });

      console.log('✅ Curtain order updated with shopId');
    }

    /* ---------------- PREPARE MEASUREMENT DATA ---------------- */
    const data = {
      orderId,
      roomName,
      width: numericWidth,
      height: numericHeight,
      curtainSize: curtainSize ? parseFloat(curtainSize) : null,
      quantity: quantity ? parseInt(quantity, 10) : 1, // Default to 1 if not provided
      size: size || null,

      thickProductId: thickProductId || null,
      thickVariant: thickVariant || null,
      thickMeter: thickMeter ? parseFloat(thickMeter) : null,
      thickPrice: thickPrice ? parseFloat(thickPrice) : null,

      thinProductId: thinProductId || null,
      thinVariant: thinVariant || null,
      thinMeter: thinMeter ? parseFloat(thinMeter) : null,
      thinPrice: thinPrice ? parseFloat(thinPrice) : null,

      curtainPoleId: curtainPoleId || null,
      curtainPoleQuantity: curtainPoleQuantity
        ? parseFloat(curtainPoleQuantity)
        : null,
      curtainPolePrice: curtainPolePrice ? parseFloat(curtainPolePrice) : null,

      curtainPullsId: curtainPullsId || null,
      curtainPullsQuantity: curtainPullsQuantity
        ? parseInt(curtainPullsQuantity, 10)
        : null,

      curtainBracketsId: curtainBracketsId || null,
      curtainBracketsQuantity: curtainBracketsQuantity
        ? parseInt(curtainBracketsQuantity, 10)
        : null,
      curtainPullsBracketsPrice: curtainPullsBracketsPrice
        ? parseFloat(curtainPullsBracketsPrice)
        : null,

      thickWorkerId: thickWorkerId || null,
      thinWorkerId: thinWorkerId || null,
      workerPrice: workerPrice ? parseFloat(workerPrice) : null,
      totalWorkerMeter: totalWorkerMeter ? parseFloat(totalWorkerMeter) : null,

      price: price ? parseFloat(price) : null,
      remark: remark || null,
      createdById: createdById || null,
    };

    console.log('📤 Final Prisma data for measurement:', data);

    /* ---------------- CREATE MEASUREMENT ---------------- */
    const result = await prisma.curtainMeasurement.create({
      data,
    });

    console.log('✅ Curtain measurement created:', result);

    /* ---------------- UPDATE CURTAIN ORDER TOTAL AMOUNT ---------------- */
    if (price) {
      const numericPrice = parseFloat(price);
      console.log(
        '💰 Updating curtain order total amount with price:',
        numericPrice,
      );

      // Get current order total - ensure it's a number
      const currentOrder = await prisma.curtainOrder.findUnique({
        where: { id: orderId },
        select: { totalAmount: true },
      });

      // Parse current total as number (handle null/undefined)
      let currentTotal = 0;
      if (currentOrder?.totalAmount) {
        currentTotal =
          typeof currentOrder.totalAmount === 'string'
            ? parseFloat(currentOrder.totalAmount)
            : Number(currentOrder.totalAmount);
      }

      // Ensure currentTotal is a valid number
      if (isNaN(currentTotal)) {
        currentTotal = 0;
      }

      const newTotal = currentTotal + numericPrice;

      console.log('📊 Total amount update:', {
        currentTotal,
        addPrice: numericPrice,
        newTotal,
      });

      // Validate that newTotal is within range (assuming your DB column is DECIMAL(10,2) or similar)
      // Maximum value for DECIMAL(10,2) is 99,999,999.99
      if (newTotal > 99999999.99) {
        console.error('❌ New total exceeds maximum allowed value:', newTotal);
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Total amount would exceed maximum allowed value',
        );
      }

      await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          totalAmount: newTotal,
        },
      });

      console.log(
        '✅ Curtain order total amount updated successfully to:',
        newTotal,
      );
    }

    return result;
  } catch (error) {
    console.error('🔥 ERROR in createCurtainMeasurement');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    throw error;
  }
};

// Update CurtainMeasurement
// Update CurtainMeasurement
const updateCurtainOrderShop = async (orderId, measurementsData, shopId) => {
  try {
    /* ---------------- ORDER CHECK ---------------- */

    const existingOrder = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
      include: {
        measurements: true,
      },
    });

    if (!existingOrder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
    }

    /* ---------------- SHOP VALIDATION (if provided) ---------------- */
    if (shopId) {
      const shopExists = await prisma.shop.findUnique({
        where: { id: shopId },
      });

      if (!shopExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Shop not found');
      }
    }

    /* ---------------- UPDATE CURTAIN ORDER WITH SHOP ID ---------------- */
    if (shopId && shopId !== existingOrder.ShopId) {
      const updatedOrder = await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          ShopId: shopId,
          updatedAt: new Date(),
        },
      });
    }

    /* ---------------- HANDLE MEASUREMENTS UPDATES ---------------- */
    const updatedMeasurements = [];
    let totalAmountChanged = false;

    if (
      measurementsData &&
      Array.isArray(measurementsData) &&
      measurementsData.length > 0
    ) {
      for (const measurementData of measurementsData) {
        const {
          id: measurementId,
          roomName,
          width,
          height,
          curtainSize,
          quantity,

          thickProductId,
          thickMeter,
          thickPrice,

          thinProductId,
          thinMeter,
          thinPrice,

          curtainPoleId,
          curtainPoleQuantity,
          curtainPolePrice,

          curtainPullsId,
          curtainPullsQuantity,

          curtainBracketsId,
          curtainBracketsQuantity,
          curtainPullsBracketsPrice,

          thickWorkerId,
          thinWorkerId,
          workerPrice,
          totalworkerMeter,

          price,
          remark,
        } = measurementData;

        if (!measurementId) {
          continue;
        }

        const existingMeasurement = await prisma.curtainMeasurement.findUnique({
          where: { id: measurementId },
        });

        if (!existingMeasurement) {
          continue;
        }

        if (existingMeasurement.orderId !== orderId) {
          console.log(
            `⚠️ Measurement ${measurementId} doesn't belong to order ${orderId}, skipping`,
          );
          continue;
        }

        // Parse price as number for comparison
        const oldPrice = existingMeasurement.price
          ? Number(existingMeasurement.price)
          : 0;
        const newPrice = price ? parseFloat(price) : null;
        const isPriceChanged = newPrice !== null && oldPrice !== newPrice;

        const updateData = {};

        if (roomName !== undefined) updateData.roomName = roomName;
        if (width !== undefined) updateData.width = parseFloat(width);
        if (height !== undefined) updateData.height = parseFloat(height);
        if (curtainSize !== undefined)
          updateData.curtainSize = curtainSize ? parseFloat(curtainSize) : null;
        if (quantity !== undefined)
          updateData.quantity = quantity ? parseInt(quantity, 10) : null;

        if (thickProductId !== undefined)
          updateData.thickProductId = thickProductId || null;
        if (thickMeter !== undefined)
          updateData.thickMeter = thickMeter ? parseFloat(thickMeter) : null;
        if (thickPrice !== undefined)
          updateData.thickPrice = thickPrice ? parseFloat(thickPrice) : null;

        if (thinProductId !== undefined)
          updateData.thinProductId = thinProductId || null;
        if (thinMeter !== undefined)
          updateData.thinMeter = thinMeter ? parseFloat(thinMeter) : null;
        if (thinPrice !== undefined)
          updateData.thinPrice = thinPrice ? parseFloat(thinPrice) : null;

        if (curtainPoleId !== undefined)
          updateData.curtainPoleId = curtainPoleId || null;
        if (curtainPoleQuantity !== undefined)
          updateData.curtainPoleQuantity = curtainPoleQuantity
            ? parseFloat(curtainPoleQuantity)
            : null;
        if (curtainPolePrice !== undefined)
          updateData.curtainPolePrice = curtainPolePrice
            ? parseFloat(curtainPolePrice)
            : null;

        if (curtainPullsId !== undefined)
          updateData.curtainPullsId = curtainPullsId || null;
        if (curtainPullsQuantity !== undefined)
          updateData.curtainPullsQuantity = curtainPullsQuantity
            ? parseInt(curtainPullsQuantity, 10)
            : null;

        if (curtainBracketsId !== undefined)
          updateData.curtainBracketsId = curtainBracketsId || null;
        if (curtainBracketsQuantity !== undefined)
          updateData.curtainBracketsQuantity = curtainBracketsQuantity
            ? parseInt(curtainBracketsQuantity, 10)
            : null;
        if (curtainPullsBracketsPrice !== undefined)
          updateData.curtainPullsBracketsPrice = curtainPullsBracketsPrice
            ? parseFloat(curtainPullsBracketsPrice)
            : null;

        if (thickWorkerId !== undefined)
          updateData.thickWorkerId = thickWorkerId || null;
        if (thinWorkerId !== undefined)
          updateData.thinWorkerId = thinWorkerId || null;
        if (workerPrice !== undefined)
          updateData.workerPrice = workerPrice ? parseFloat(workerPrice) : null;
        if (totalworkerMeter !== undefined)
          updateData.totalWorkerMeter = totalworkerMeter
            ? parseFloat(totalworkerMeter)
            : null;

        if (price !== undefined) {
          updateData.price = newPrice;
        }
        if (remark !== undefined) updateData.remark = remark || null;

        const updatedMeasurement = await prisma.curtainMeasurement.update({
          where: { id: measurementId },
          data: updateData,
        });

        updatedMeasurements.push(updatedMeasurement);

        if (isPriceChanged) {
          totalAmountChanged = true;
          console.log(`💰 Price changed for measurement ${measurementId}:`, {
            old: oldPrice,
            new: newPrice,
          });
        }
      }
    }

    /* ---------------- RECALCULATE ORDER TOTAL AMOUNT ---------------- */
    if (totalAmountChanged) {
      const allMeasurements = await prisma.curtainMeasurement.findMany({
        where: { orderId },
        select: { price: true },
      });

      // Sum all prices as numbers
      let newTotal = 0;
      for (const measurement of allMeasurements) {
        if (measurement.price) {
          newTotal += Number(measurement.price);
        }
      }

      // Validate newTotal is within range
      if (newTotal > 99999999.99) {
        console.error('❌ New total exceeds maximum allowed value:', newTotal);
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Total amount would exceed maximum allowed value',
        );
      }

      await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          totalAmount: newTotal,
          updatedAt: new Date(),
        },
      });
    }

    const finalOrder = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
      include: {
        measurements: true,
        Shop: true,
        customer: true,
      },
    });

    return {
      order: finalOrder,
      updatedMeasurements,
    };
  } catch (error) {
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    throw error;
  }
};
const deleteCurtainMeasurement = async (id) => {
  // Check if measurement exists
  const existing = await prisma.curtainMeasurement.findUnique({
    where: { id },
    include: {
      order: true,
    },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain measurement not found');
  }

  // Optional: Check if there are any dependencies or restrictions
  // For example, if the order is already finalized, you might not want to allow deletion
  // const order = await prisma.curtainOrder.findUnique({
  //   where: { id: existing.orderId },
  // });

  // if (order?.status === 'FINALIZED' || order?.status === 'COMPLETED') {
  //   throw new ApiError(
  //     httpStatus.BAD_REQUEST,
  //     'Cannot delete measurement from a finalized/completed order'
  //   );
  // }

  // Get the price of the measurement to subtract from total
  const measurementPrice = existing.price ? Number(existing.price) : 0;
  console.log('💰 Measurement price to subtract:', measurementPrice);

  // Delete the measurement
  await prisma.curtainMeasurement.delete({
    where: { id },
  });

  // Update order total amount by subtracting the measurement price
  if (measurementPrice > 0) {
    console.log('🔄 Updating order total amount after deletion');

    // Get current order total
    const currentOrder = await prisma.curtainOrder.findUnique({
      where: { id: existing.orderId },
      select: { totalAmount: true },
    });

    // Parse current total as number
    let currentTotal = 0;
    if (currentOrder?.totalAmount) {
      currentTotal = typeof currentOrder.totalAmount === 'string' 
        ? parseFloat(currentOrder.totalAmount) 
        : Number(currentOrder.totalAmount);
    }
    
    // Ensure currentTotal is a valid number
    if (isNaN(currentTotal)) {
      currentTotal = 0;
    }

    // Calculate new total (subtract the deleted measurement price)
    const newTotal = currentTotal - measurementPrice;

    console.log('📊 Total amount update after deletion:', {
      currentTotal,
      subtractPrice: measurementPrice,
      newTotal,
    });

    // Ensure newTotal doesn't go negative
    const finalTotal = newTotal < 0 ? 0 : newTotal;

    // Update the order total
    await prisma.curtainOrder.update({
      where: { id: existing.orderId },
      data: {
        totalAmount: finalTotal,
        updatedAt: new Date(),
      },
    });

    console.log('✅ Order total amount updated successfully to:', finalTotal);
  }

  return {
    message: 'Curtain measurement deleted successfully',
    deletedMeasurementId: id,
    orderId: existing.orderId,
    subtractedAmount: measurementPrice,
  };
};
/* ──────────────── EXPORTS createsecondCurtainMeasurement,updatesecondCurtainOrderShop ──────────────── */
const createsecondCurtainMeasurement = async (
  orderId,
  curtainMeasurementData,
  createdById,
  shopId,
) => {
  console.log('🚀 createCurtainMeasurement START');
  console.log('📥 Raw input:', curtainMeasurementData);
  console.log('👤 createdById:', createdById);
  console.log('🏪 shopId:', shopId);

  try {
    // Check if curtainMeasurementData is an array and extract the first element
    let measurementData;
    if (Array.isArray(curtainMeasurementData)) {
      if (curtainMeasurementData.length === 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'No measurement data provided',
        );
      }
      measurementData = curtainMeasurementData[0];
      console.log('📋 Extracted first element from array:', measurementData);
    } else {
      measurementData = curtainMeasurementData;
    }

    const {
      roomName,
      width,
      height,
      quantity,
      unitprice,
      pricePerUnit,
      price,
      remark,
      shatterVerticalProductId,
    } = measurementData;

    console.log('🧩 Destructured values:', {
      orderId,
      roomName,
      width,
      height,
      quantity,
      unitprice,
      pricePerUnit,
      price,
      remark,
      shatterVerticalProductId,
    });

    /* ---------------- REQUIRED FIELD VALIDATION ---------------- */
    console.log('🔍 Validating required fields');

    if (!orderId) {
      console.error('❌ Missing orderId');
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
    }

    if (!roomName) {
      console.error('❌ Missing roomName');
      throw new ApiError(httpStatus.BAD_REQUEST, 'Room name is required');
    }

    if (width === undefined || width === null) {
      console.error('❌ Missing width');
      throw new ApiError(httpStatus.BAD_REQUEST, 'Width is required');
    }

    if (height === undefined || height === null) {
      console.error('❌ Missing height');
      throw new ApiError(httpStatus.BAD_REQUEST, 'Height is required');
    }

    /* ---------------- ORDER CHECK ---------------- */
    console.log('🔍 Checking order exists:', orderId);

    const orderExists = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
    });

    console.log('📦 orderExists:', orderExists);

    if (!orderExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order not found');
    }

    /* ---------------- SHOP VALIDATION (if provided) ---------------- */
    if (shopId) {
      console.log('🏪 Validating shop:', shopId);

      const shopExists = await prisma.shop.findUnique({
        where: { id: shopId },
      });

      console.log('🏪 Shop exists:', shopExists);

      if (!shopExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Shop not found');
      }
    }

    /* ---------------- VALIDATE SHATTER VERTICAL PRODUCT (if provided) ---------------- */
    if (shatterVerticalProductId) {
      console.log(
        '🔍 Validating shatter vertical product:',
        shatterVerticalProductId,
      );

      const productExists = await prisma.product.findUnique({
        where: { id: shatterVerticalProductId },
      });

      console.log('📦 Product exists:', productExists);

      if (!productExists) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Shatter vertical product not found',
        );
      }
    }

    /* ---------------- NUMERIC VALIDATION ---------------- */
    console.log('🔢 Validating numeric values');

    const numericWidth = parseFloat(width);
    const numericHeight = parseFloat(height);

    console.log('➡️ Parsed width/height:', numericWidth, numericHeight);

    if (Number.isNaN(numericWidth) || numericWidth <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid width value');
    }

    if (Number.isNaN(numericHeight) || numericHeight <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid height value');
    }

    /* ---------------- UPDATE CURTAIN ORDER WITH SHOP ID ---------------- */
    if (shopId) {
      console.log('🔄 Updating curtain order with shopId:', shopId);

      await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          ShopId: shopId,
          updatedAt: new Date(),
        },
      });

      console.log('✅ Curtain order updated with shopId');
    }

    /* ---------------- PREPARE MEASUREMENT DATA ---------------- */
    const data = {
      orderId,
      roomName,
      width: numericWidth,
      height: numericHeight,
      quantity: quantity ? parseInt(quantity, 10) : null,
      unitprice: unitprice ? parseFloat(unitprice) : null,
      pricePerUnit: pricePerUnit ? parseFloat(pricePerUnit) : null,
      price: price ? parseFloat(price) : null,
      remark: remark || null,
      createdById: createdById || null,
      shatterVerticalProductId: shatterVerticalProductId || null,
    };

    console.log('📤 Final Prisma data for measurement:', data);

    /* ---------------- CREATE MEASUREMENT ---------------- */
    const result = await prisma.curtainMeasurement.create({
      data,
      include: {
        shatterVerticalProduct: true,
      },
    });

    console.log('✅ Curtain measurement created:', result);

    /* ---------------- UPDATE CURTAIN ORDER TOTAL AMOUNT ---------------- */
    if (price) {
      console.log('💰 Updating curtain order total amount with price:', price);

      // Get current order total - FIX: Convert to number properly
      const currentOrder = await prisma.curtainOrder.findUnique({
        where: { id: orderId },
        select: { totalAmount: true },
      });

      // FIX: Convert Decimal/string to number
      const currentTotal = currentOrder?.totalAmount
        ? parseFloat(currentOrder.totalAmount.toString())
        : 0;

      const addPrice = parseFloat(price);
      const newTotal = currentTotal + addPrice;

      console.log('📊 Total amount update:', {
        currentTotal,
        addPrice,
        newTotal,
      });

      await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          totalAmount: newTotal, // Prisma will handle number to Decimal conversion
          updatedAt: new Date(),
        },
      });

      console.log('✅ Curtain order total amount updated successfully');
    }

    return result;
  } catch (error) {
    console.error('🔥 ERROR in createCurtainMeasurement');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    throw error;
  }
};

// Update CurtainMeasurement
const updatesecondCurtainOrderShop = async (
  orderId,
  measurementsData,
  shopId,
) => {
  console.log('🚀 updateCurtainOrderShop START');
  console.log('📦 Order ID:', orderId);
  console.log('🏪 Shop ID:', shopId);
  console.log('📐 Measurements data:', measurementsData);

  try {
    /* ---------------- ORDER CHECK ---------------- */
    console.log('🔍 Checking order exists:', orderId);

    const existingOrder = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
      include: {
        measurements: {
          include: {
            shatterVerticalProduct: true,
          },
        },
      },
    });

    console.log('📦 Existing order:', existingOrder);

    if (!existingOrder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
    }

    /* ---------------- SHOP VALIDATION (if provided) ---------------- */
    if (shopId) {
      console.log('🏪 Validating shop:', shopId);

      const shopExists = await prisma.shop.findUnique({
        where: { id: shopId },
      });

      console.log('🏪 Shop exists:', shopExists);

      if (!shopExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Shop not found');
      }
    }

    /* ---------------- UPDATE CURTAIN ORDER WITH SHOP ID ---------------- */
    if (shopId && shopId !== existingOrder.ShopId) {
      console.log('🔄 Updating curtain order shopId:', shopId);

      const updatedOrder = await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          ShopId: shopId,
          updatedAt: new Date(),
        },
      });

      console.log('✅ Curtain order updated with shopId:', updatedOrder);
    }

    /* ---------------- HANDLE MEASUREMENTS UPDATES ---------------- */
    const updatedMeasurements = [];
    let totalAmountChanged = false;

    if (
      measurementsData &&
      Array.isArray(measurementsData) &&
      measurementsData.length > 0
    ) {
      console.log(
        '📝 Processing measurements updates:',
        measurementsData.length,
      );

      for (const measurementData of measurementsData) {
        const {
          id: measurementId, // This is the measurement ID
          roomName,
          width,
          height,
          quantity,
          unitprice,
          pricePerUnit,
          price,
          remark,
          shatterVerticalProductId,
        } = measurementData;

        // If no measurement ID, skip or create new measurement
        if (!measurementId) {
          console.log('⚠️ No measurement ID provided, skipping update');
          continue;
        }

        // Check if measurement exists and belongs to this order
        const existingMeasurement = await prisma.curtainMeasurement.findUnique({
          where: { id: measurementId },
        });

        if (!existingMeasurement) {
          console.log(`⚠️ Measurement ${measurementId} not found, skipping`);
          continue;
        }

        if (existingMeasurement.orderId !== orderId) {
          console.log(
            `⚠️ Measurement ${measurementId} doesn't belong to order ${orderId}, skipping`,
          );
          continue;
        }

        // Check if price is being updated - FIX: Convert to numbers properly
        const isPriceChanged =
          price !== undefined &&
          parseFloat(price) !==
            parseFloat(existingMeasurement.price?.toString() || '0');

        /* ---------------- VALIDATE SHATTER VERTICAL PRODUCT (if provided) ---------------- */
        if (shatterVerticalProductId) {
          console.log(
            '🔍 Validating shatter vertical product:',
            shatterVerticalProductId,
          );

          const productExists = await prisma.product.findUnique({
            where: { id: shatterVerticalProductId },
          });

          console.log('📦 Product exists:', productExists);

          if (!productExists) {
            console.log(
              `⚠️ Shatter vertical product ${shatterVerticalProductId} not found, skipping update for measurement`,
            );
            continue;
          }
        }

        // Prepare update data
        const updateData = {};

        if (roomName !== undefined) updateData.roomName = roomName;
        if (width !== undefined) updateData.width = parseFloat(width);
        if (height !== undefined) updateData.height = parseFloat(height);
        if (quantity !== undefined)
          updateData.quantity = quantity ? parseInt(quantity, 10) : null;
        if (unitprice !== undefined)
          updateData.unitprice = unitprice ? parseFloat(unitprice) : null;
        if (pricePerUnit !== undefined)
          updateData.pricePerUnit = pricePerUnit
            ? parseFloat(pricePerUnit)
            : null;
        if (price !== undefined)
          updateData.price = price ? parseFloat(price) : null;
        if (remark !== undefined) updateData.remark = remark || null;
        if (shatterVerticalProductId !== undefined) {
          updateData.shatterVerticalProductId =
            shatterVerticalProductId || null;
        }

        // Update the measurement
        const updatedMeasurement = await prisma.curtainMeasurement.update({
          where: { id: measurementId },
          data: updateData,
          include: {
            shatterVerticalProduct: true,
          },
        });

        updatedMeasurements.push(updatedMeasurement);
        console.log(`✅ Measurement ${measurementId} updated`);

        // Track if price changed for this measurement
        if (isPriceChanged) {
          totalAmountChanged = true;
          console.log(`💰 Price changed for measurement ${measurementId}:`, {
            old: existingMeasurement.price?.toString() || '0',
            new: updatedMeasurement.price?.toString() || '0',
          });
        }
      }
    }

    /* ---------------- RECALCULATE ORDER TOTAL AMOUNT ---------------- */
    if (totalAmountChanged) {
      console.log('💰 Recalculating order total amount due to price updates');

      // Get all measurements for this order with their current prices
      const allMeasurements = await prisma.curtainMeasurement.findMany({
        where: { orderId },
        select: { price: true },
      });

      // FIX: Convert Decimal/string values to numbers properly
      const newTotal = allMeasurements.reduce((sum, measurement) => {
        const price = measurement.price
          ? parseFloat(measurement.price.toString())
          : 0;
        return sum + price;
      }, 0);

      console.log('📊 New total amount calculation:', {
        measurementCount: allMeasurements.length,
        newTotal,
      });

      // Update the order total
      await prisma.curtainOrder.update({
        where: { id: orderId },
        data: {
          totalAmount: newTotal, // Prisma will handle number to Decimal conversion
          updatedAt: new Date(),
        },
      });

      console.log('✅ Order total amount updated successfully');
    }

    // Return the updated order with measurements
    const finalOrder = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
      include: {
        measurements: {
          include: {
            shatterVerticalProduct: true,
          },
        },
        Shop: true,
        customer: true,
      },
    });

    console.log('✅ Curtain order and measurements updated successfully');
    console.log(
      '📊 Final order total amount:',
      finalOrder.totalAmount?.toString(),
    );

    return {
      order: finalOrder,
      updatedMeasurements,
    };
  } catch (error) {
    console.error('🔥 ERROR in updateCurtainOrderShop');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    throw error;
  }
};

// Helper function to deduct product stock
// Helper function to deduct product stock
// Helper function to deduct product stock
const deductProductStock = async (
  tx,
  { productId, shopId, quantity, measurementId, productType, updatedById },
) => {
  // Find or create shop stock record
  const shopStock = await tx.shopStock.findFirst({
    where: {
      productId,
      shopId,
    },
    include: {
      product: true,
    },
  });

  if (!shopStock) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `No stock found for ${productType} in this shop`,
    );
  }

  // Check if sufficient stock available
  if (shopStock.quantity < quantity) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for ${productType}. Available: ${shopStock.quantity}, Required: ${quantity}`,
    );
  }

  // Update shop stock
  const updatedShopStock = await tx.shopStock.update({
    where: { id: shopStock.id },
    data: {
      quantity: {
        decrement: quantity,
      },
    },
  });

  // Create stock ledger entry with required fields - REMOVED balance field
  await tx.stockLedger.create({
    data: {
      productId,
      shopId,
      movementType: 'OUT', // Required field
      quantity: -quantity, // Negative for deduction
      unitOfMeasureId: shopStock.unitOfMeasureId, // Required field
      reference: `Order completion - Measurement: ${measurementId}`,
      userId: updatedById,
      notes: `${productType} deducted for curtain order. Current stock: ${updatedShopStock.quantity}`,
    },
  });

  // Create log entry
  await tx.log.create({
    data: {
      action: `Deducted ${quantity} units of ${productType} (Product ID: ${productId}) for curtain order completion - Measurement ID: ${measurementId}. Remaining stock: ${updatedShopStock.quantity}`,
      userId: updatedById,
    },
  });

  return updatedShopStock;
};

// Helper function to restore product stock (for cancellations)
const restoreProductStock = async (
  tx,
  { productId, shopId, quantity, measurementId, productType, updatedById },
) => {
  // Find shop stock record
  let shopStock = await tx.shopStock.findFirst({
    where: {
      productId,
      shopId,
    },
    include: {
      product: true,
    },
  });

  if (!shopStock) {
    // Get product to get unitOfMeasureId
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { unitOfMeasure: true },
    });

    if (!product) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Product not found for ${productType}`,
      );
    }

    // Create new stock record if it doesn't exist
    shopStock = await tx.shopStock.create({
      data: {
        productId,
        shopId,
        quantity: 0,
        unitOfMeasureId: product.unitOfMeasureId,
        status: 'Available',
      },
    });
  }

  // Update shop stock
  const updatedShopStock = await tx.shopStock.update({
    where: { id: shopStock.id },
    data: {
      quantity: {
        increment: quantity,
      },
    },
  });

  // Create stock ledger entry with required fields - REMOVED balance field
  await tx.stockLedger.create({
    data: {
      productId,
      shopId,
      movementType: 'RETERN', // Using RETERN as per your schema
      quantity, // Positive for restoration
      unitOfMeasureId: shopStock.unitOfMeasureId, // Required field
      reference: `Order cancellation - Measurement: ${measurementId}`,
      userId: updatedById,
      notes: `${productType} restored for curtain order cancellation. Current stock: ${updatedShopStock.quantity}`,
    },
  });

  // Create log entry
  await tx.log.create({
    data: {
      action: `Restored ${quantity} units of ${productType} (Product ID: ${productId}) for curtain order cancellation - Measurement ID: ${measurementId}. Current stock: ${updatedShopStock.quantity}`,
      userId: updatedById,
    },
  });

  return updatedShopStock;
};

// Helper function to restore product stock (for cancellations)
// Helper function to restore product stock (for cancellations)
const updateCurtainOrderStatus = async (orderId, statusData, updatedById) => {
  const { curtainStatus, paymentStatus } = statusData;

  // Validate required fields
  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }

  if (!curtainStatus) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Curtain status is required');
  }

  // Validate curtain status
  const validCurtainStatuses = [
    'PENDING',
    'COMPLETED',
    'CANCELLED',
    'DELIVERED',
  ];
  if (!validCurtainStatuses.includes(curtainStatus)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid curtain status');
  }

  // Check if order exists
  const orderExists = await prisma.curtainOrder.findUnique({
    where: { id: orderId },
    include: {
      measurements: {
        include: {
          thickProduct: true,
          thinProduct: true,
          curtainPole: true,
          curtainPulls: true,
          curtainBrackets: true,
          shatterVerticalProduct: true,
        },
      },
      Shop: true,
    },
  });

  if (!orderExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  // Check if order is already completed - prevent duplicate stock deduction
  if (
    orderExists.curtainStatus === 'COMPLETED' &&
    curtainStatus === 'COMPLETED'
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order is already completed');
  }

  // Business logic validation
  // If marking as COMPLETED, check if all measurements are present
  if (curtainStatus === 'COMPLETED') {
    if (!orderExists.measurements || orderExists.measurements.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot mark as COMPLETED without measurements',
      );
    }

    // Check if shop is assigned
    if (!orderExists.ShopId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot mark as COMPLETED without assigned shop',
      );
    }
  }

  // If marking as CANCELLED, ensure payment status is appropriate
  if (curtainStatus === 'CANCELLED') {
    // Check if there are any payments made
    if (orderExists.totalpaid && parseFloat(orderExists.totalpaid) > 0) {
      // Check if payment status is being changed to PENDING
      if (paymentStatus && paymentStatus === 'PENDING') {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot set payment status to PENDING when there are payments made',
        );
      }

      // If payment status not provided, keep existing one
      if (!paymentStatus && orderExists.paymentStatus === 'PENDING') {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot cancel order with pending payments',
        );
      }
    }
  }

  // Prepare update data
  const updateData = {
    curtainStatus,
    updatedById: updatedById || null,
  };

  // Add payment status if provided
  if (paymentStatus) {
    updateData.paymentStatus = paymentStatus;
  }

  // Update the order
  try {
    // Use transaction for stock deduction and order update - rename inner prisma to tx to avoid shadowing
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update order status
      const updated = await tx.curtainOrder.update({
        where: { id: orderId },
        data: updateData,
        include: {
          customer: true,
          movementType: true,
          measurements: {
            include: {
              thickProduct: true,
              thinProduct: true,
              curtainPole: true,
              curtainPulls: true,
              curtainBrackets: true,
              shatterVerticalProduct: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          Shop: true,
        },
      });

      // If marking as CANCELLED and order was previously COMPLETED, restore stock
      // if (
      //   curtainStatus === 'CANCELLED' &&
      //   orderExists.curtainStatus === 'COMPLETED'
      // ) {
      //   for (const measurement of orderExists.measurements) {
      //     // Restore thick curtain product stock
      //     if (measurement.thickProductId && measurement.thickMeter) {
      //       await restoreProductStock(tx, {
      //         productId: measurement.thickProductId,
      //         shopId: orderExists.ShopId,
      //         quantity: measurement.thickMeter,
      //         measurementId: measurement.id,
      //         productType: 'thick curtain',
      //         updatedById,
      //       });
      //     }

      //     // Restore thin curtain product stock
      //     if (measurement.thinProductId && measurement.thinMeter) {
      //       await restoreProductStock(tx, {
      //         productId: measurement.thinProductId,
      //         shopId: orderExists.ShopId,
      //         quantity: measurement.thinMeter,
      //         measurementId: measurement.id,
      //         productType: 'thin curtain',
      //         updatedById,
      //       });
      //     }

      //     // Restore curtain pole stock
      //     if (measurement.curtainPoleId && measurement.curtainPoleQuantity) {
      //       await restoreProductStock(tx, {
      //         productId: measurement.curtainPoleId,
      //         shopId: orderExists.ShopId,
      //         quantity: measurement.curtainPoleQuantity,
      //         measurementId: measurement.id,
      //         productType: 'curtain pole',
      //         updatedById,
      //       });
      //     }

      //     // Restore curtain pulls stock
      //     if (measurement.curtainPullsId && measurement.curtainPullsQuantity) {
      //       await restoreProductStock(tx, {
      //         productId: measurement.curtainPullsId,
      //         shopId: orderExists.ShopId,
      //         quantity: measurement.curtainPullsQuantity,
      //         measurementId: measurement.id,
      //         productType: 'curtain pulls',
      //         updatedById,
      //       });
      //     }

      //     // Restore curtain brackets stock
      //     if (
      //       measurement.curtainBracketsId &&
      //       measurement.curtainBracketsQuantity
      //     ) {
      //       await restoreProductStock(tx, {
      //         productId: measurement.curtainBracketsId,
      //         shopId: orderExists.ShopId,
      //         quantity: measurement.curtainBracketsQuantity,
      //         measurementId: measurement.id,
      //         productType: 'curtain brackets',
      //         updatedById,
      //       });
      //     }

      //     // Restore shatter vertical product stock
      //     if (measurement.shatterVerticalProductId && measurement.quantity) {
      //       await restoreProductStock(tx, {
      //         productId: measurement.shatterVerticalProductId,
      //         shopId: orderExists.ShopId,
      //         quantity: measurement.quantity,
      //         measurementId: measurement.id,
      //         productType: 'shatter vertical',
      //         updatedById,
      //       });
      //     }
      //   }
      // }

      // 🔄 NEW: If marking as DELIVERED, withdraw stock for non-curtain items (pole, pulls, brackets, shatter vertical)
      // Note: Thick and thin curtains are NOT withdrawn here - they are withdrawn in COMPLETED
      if (
        curtainStatus === 'DELIVERED' &&
        orderExists.curtainStatus !== 'DELIVERED'
      ) {
        for (const measurement of orderExists.measurements) {
          // Deduct curtain pole stock (if not already deducted in COMPLETED)
          if (measurement.curtainPoleId && measurement.curtainPoleQuantity) {
            await deductProductStock(tx, {
              productId: measurement.curtainPoleId,
              shopId: orderExists.ShopId,
              quantity: measurement.curtainPoleQuantity,
              measurementId: measurement.id,
              productType: 'curtain pole',
              updatedById,
            });
          }

          // Deduct curtain pulls stock (if not already deducted in COMPLETED)
          if (measurement.curtainPullsId && measurement.curtainPullsQuantity) {
            await deductProductStock(tx, {
              productId: measurement.curtainPullsId,
              shopId: orderExists.ShopId,
              quantity: measurement.curtainPullsQuantity,
              measurementId: measurement.id,
              productType: 'curtain pulls',
              updatedById,
            });
          }

          // Deduct curtain brackets stock (if not already deducted in COMPLETED)
          if (
            measurement.curtainBracketsId &&
            measurement.curtainBracketsQuantity
          ) {
            await deductProductStock(tx, {
              productId: measurement.curtainBracketsId,
              shopId: orderExists.ShopId,
              quantity: measurement.curtainBracketsQuantity,
              measurementId: measurement.id,
              productType: 'curtain brackets',
              updatedById,
            });
          }

          // Deduct shatter vertical product stock (if not already deducted in COMPLETED)
          if (measurement.shatterVerticalProductId && measurement.quantity) {
            await deductProductStock(tx, {
              productId: measurement.shatterVerticalProductId,
              shopId: orderExists.ShopId,
              quantity: measurement.quantity,
              measurementId: measurement.id,
              productType: 'shatter vertical',
              updatedById,
            });
          }
        }
      }

      return updated;
    });

    return updatedOrder;
  } catch (error) {
    console.error('Error updating curtain order status:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to update status: ${error.message}`,
    );
  }
};
const updateCurtainOrderPayment = async (
  orderId,
  amount,
  updatedById,
  paymentStatus = null,
) => {
  console.log('amount jemila bekele', amount);
  const additionalPayment = amount;

  // Validate required fields
  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }

  if (additionalPayment === undefined || additionalPayment === null) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Additional payment amount is required',
    );
  }

  // Parse once and validate
  const additionalPaymentAmount = parseFloat(additionalPayment);
  console.log('📊 Parsed payment amount:', {
    originalAmount: additionalPayment,
    parsedAmount: additionalPaymentAmount,
    isNaN: Number.isNaN(additionalPaymentAmount),
    isNegative: additionalPaymentAmount < 0,
  });

  if (Number.isNaN(additionalPaymentAmount) || additionalPaymentAmount < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid additional payment amount',
    );
  }

  // Validate payment status
  const validPaymentStatuses = ['PENDING', 'PAID'];
  if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment status');
  }

  // Check if order exists with current payment info
  const orderExists = await prisma.curtainOrder.findUnique({
    where: { id: orderId },
    include: {
      measurements: true,
    },
  });

  if (!orderExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  // Log order financial details
  console.log('💰 Order financial details:', {
    orderId,
    rawBalance: orderExists.balance,
    rawTotalPaid: orderExists.totalPaid,
    rawTotalAmount: orderExists.totalAmount,
  });

  // Get current balance and validate with proper precision
  const currentBalance = parseFloat(orderExists.balance) || 0;
  console.log('💵 Current balance:', {
    currentBalance,
    type: typeof currentBalance,
    isZero: currentBalance === 0,
    isNegative: currentBalance < 0,
  });

  // FIRST VALIDATION: Check if balance is already zero or negative (with tolerance)
  const EPSILON = 0.01; // Tolerance for floating point errors
  if (currentBalance <= EPSILON) {
    console.error('❌ VALIDATION FAILED: Balance is zero or negative', {
      orderId,
      currentBalance,
      reason:
        currentBalance <= EPSILON
          ? 'Balance is effectively zero'
          : 'Balance is negative',
    });
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot update payment. Order is already fully paid. Current balance: ${currentBalance.toFixed(
        2,
      )}`,
    );
  }

  // Calculate total amount from measurements
  console.log('📏 Calculating total from measurements...');
  const calculatedTotalAmount = orderExists.measurements.reduce(
    (sum, measurement) => {
      const price = parseFloat(measurement.price) || 0;
      console.log(`  Measurement ${measurement.id}: price = ${price}`);
      return sum + price;
    },
    0,
  );
  console.log('📊 Total amount calculation:', {
    calculatedTotalAmount,
    storedTotalAmount: orderExists.totalAmount,
    difference:
      calculatedTotalAmount - (parseFloat(orderExists.totalAmount) || 0),
  });

  // Get current total paid from the order
  const currentTotalPaid = parseFloat(orderExists.totalPaid) || 0;
  console.log('💰 Current total paid:', currentTotalPaid);

  // FIXED VALIDATION: Allow payment up to current balance with tolerance
  // Use toFixed to handle floating point precision issues
  const roundedPaymentAmount = Math.round(additionalPaymentAmount * 100) / 100;
  const roundedCurrentBalance = Math.round(currentBalance * 100) / 100;

  console.log('🔍 Payment validation check (with precision handling):', {
    additionalPaymentAmount: roundedPaymentAmount,
    currentBalance: roundedCurrentBalance,
    willExceed: roundedPaymentAmount > roundedCurrentBalance + EPSILON,
    difference: roundedPaymentAmount - roundedCurrentBalance,
  });

  // Allow payment if it's within EPSILON of the balance (handles floating point errors)
  if (roundedPaymentAmount > roundedCurrentBalance + EPSILON) {
    console.error('❌ VALIDATION FAILED: Payment exceeds balance', {
      orderId,
      additionalPaymentAmount: roundedPaymentAmount,
      currentBalance: roundedCurrentBalance,
      excessAmount: (roundedPaymentAmount - roundedCurrentBalance).toFixed(2),
    });
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Payment amount (${roundedPaymentAmount.toFixed(
        2,
      )}) exceeds current balance (${roundedCurrentBalance.toFixed(
        2,
      )}). Maximum allowed payment is ${roundedCurrentBalance.toFixed(2)}`,
    );
  }

  // Calculate new total paid - use exact payment amount (don't exceed balance)
  let actualPaymentAmount = roundedPaymentAmount;
  if (roundedPaymentAmount > roundedCurrentBalance) {
    // If there's a tiny rounding error, adjust the payment amount
    actualPaymentAmount = roundedCurrentBalance;
    console.warn(
      `⚠️ Adjusted payment from ${roundedPaymentAmount} to ${actualPaymentAmount} to prevent negative balance`,
    );
  }

  const newTotalPaid = currentTotalPaid + actualPaymentAmount;
  console.log('➕ New total paid calculation:', {
    currentTotalPaid,
    actualPaymentAmount,
    newTotalPaid,
  });

  // Calculate new balance
  let newBalance = calculatedTotalAmount - newTotalPaid;

  // Fix any floating point rounding issues
  newBalance = Math.round(newBalance * 100) / 100;

  console.log('⚖️ Balance calculation:', {
    calculatedTotalAmount,
    newTotalPaid,
    newBalance,
    isNegative: newBalance < 0,
  });

  // Ensure balance never goes negative (force to zero if within tolerance)
  if (newBalance < 0 && Math.abs(newBalance) <= EPSILON) {
    console.warn(
      `⚠️ Tiny negative balance detected: ${newBalance}, setting to 0`,
    );
    newBalance = 0;
  }

  // SECOND VALIDATION: Double-check balance is not negative
  if (newBalance < -EPSILON) {
    console.error('❌ CRITICAL: Balance would become negative!', {
      calculatedTotalAmount,
      newTotalPaid,
      newBalance,
      currentBalance,
      additionalPaymentAmount: actualPaymentAmount,
    });
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Payment would make balance negative. Current balance: ${currentBalance.toFixed(
        2,
      )}, Payment amount: ${actualPaymentAmount.toFixed(
        2,
      )}. Maximum allowed payment: ${currentBalance.toFixed(2)}`,
    );
  }

  // Ensure balance is never negative (final safety)
  const finalBalance = Math.max(0, newBalance);

  console.log('✅ All validations passed! Proceeding with payment update...');

  // Determine payment status based on payment completion
  let finalPaymentStatus = paymentStatus;

  // If payment status not explicitly provided, auto-determine
  if (!finalPaymentStatus) {
    // Check if balance is zero (with tolerance)
    if (finalBalance <= EPSILON) {
      finalPaymentStatus = 'PAID';

      console.log(
        `✅ ORDER FULLY PAID - Order ID: ${orderId}, Status: ${finalPaymentStatus}, Balance is: ${finalBalance} (ZERO)`,
      );

      console.log(`Order ${orderId} fully paid. Balance: ${finalBalance}`);
    } else {
      finalPaymentStatus = 'PENDING';
      console.log(
        `Order ${orderId} partially paid. Remaining balance: ${finalBalance}`,
      );
    }
  } else if (finalPaymentStatus === 'PAID' && finalBalance > EPSILON) {
    // If someone tries to manually set PAID but balance is not zero
    console.warn(`Warning: Setting PAID status but balance is ${finalBalance}`);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot set PAID status when balance is not zero. Current balance: ${finalBalance.toFixed(
        2,
      )}`,
    );
  }

  // Additional console log for any case where payment status is PAID and balance is zero
  if (finalPaymentStatus === 'PAID' && finalBalance <= EPSILON) {
    console.log(
      `🎯 PAYMENT COMPLETED - Order ID: ${orderId} | Status: PAID | Balance: ${finalBalance} | Amount Paid: ${actualPaymentAmount}`,
    );
  }

  // Prepare update data with safe balance (never negative)
  const updateData = {
    totalAmount: calculatedTotalAmount,
    totalPaid: newTotalPaid,
    balance: finalBalance,
    paymentStatus: finalPaymentStatus,
    updatedById: updatedById || null,
  };

  // Log the payment update for debugging
  console.log('📝 Final payment update data:', {
    orderId,
    additionalPaymentAmount: actualPaymentAmount,
    currentTotalPaid,
    newTotalPaid,
    calculatedTotalAmount,
    currentBalance,
    newBalance: finalBalance,
    originalNewBalance: newBalance,
    finalPaymentStatus,
    isFullyPaid: finalBalance <= EPSILON,
  });

  // Update the order
  try {
    const updatedOrder = await prisma.curtainOrder.update({
      where: { id: orderId },
      data: updateData,
      include: {
        customer: true,
        movementType: true,
        measurements: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Verify after update that balance is not negative
    if (updatedOrder.balance < 0) {
      console.error(
        `CRITICAL: Balance became negative after update! Order ID: ${orderId}, Balance: ${updatedOrder.balance}`,
      );
    }

    // Create a log entry for the payment update
    const paymentStatusMessage =
      finalBalance <= EPSILON
        ? `ORDER FULLY PAID - Balance is zero (${finalBalance})`
        : `Partial payment - Remaining balance: ${finalBalance}`;

    await prisma.log.create({
      data: {
        action: `Payment added for curtain order ${orderId}: ${paymentStatusMessage}. Additional Payment = ${actualPaymentAmount}, Previous Total Paid = ${currentTotalPaid}, New Total Paid = ${newTotalPaid}, Previous Balance = ${currentBalance}, New Balance = ${finalBalance}, Status = ${finalPaymentStatus}`,
        userId: updatedById || null,
      },
    });

    console.log('✅ Payment update completed successfully!');
    return updatedOrder;
  } catch (error) {
    console.error('Error updating curtain order payment:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update payment',
    );
  }
};
const updateCurtainOrderDeliveryDeadline = async (
  orderId,
  deliveryDeadline,
  updatedById,
) => {
  console.log('🚀 updateCurtainOrderDeliveryDeadline START');
  console.log('📦 Order ID:', orderId);
  console.log('📅 Delivery Deadline:', deliveryDeadline);
  console.log('👤 Updated By:', updatedById);

  try {
    /* ---------------- VALIDATION ---------------- */
    if (!orderId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
    }

    if (deliveryDeadline === undefined || deliveryDeadline === null) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Delivery deadline is required',
      );
    }

    /* ---------------- CHECK ORDER EXISTS ---------------- */
    const existingOrder = await prisma.curtainOrder.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        movementType: true,
      },
    });

    if (!existingOrder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
    }

    /* ---------------- VALIDATE DELIVERY DEADLINE ---------------- */
    let parsedDeadline;

    // Handle different input types
    if (deliveryDeadline instanceof Date) {
      parsedDeadline = deliveryDeadline;
    } else if (typeof deliveryDeadline === 'string') {
      parsedDeadline = new Date(deliveryDeadline);
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid delivery deadline format. Must be a valid date.',
      );
    }

    // Check if date is valid
    if (Number.isNaN(parsedDeadline.getTime())) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid delivery deadline date',
      );
    }

    // Optional: Check if deadline is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (parsedDeadline < today) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Delivery deadline cannot be in the past',
      );
    }

    console.log('✅ Delivery deadline validated:', parsedDeadline);

    /* ---------------- UPDATE DELIVERY DEADLINE ---------------- */
    const updateData = {
      deliveryDeadline: parsedDeadline,
      updatedById: updatedById || null,
      updatedAt: new Date(),
    };

    const updatedOrder = await prisma.curtainOrder.update({
      where: { id: orderId },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone1: true,
          },
        },
        movementType: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    console.log('✅ Delivery deadline updated successfully:', {
      orderId: updatedOrder.id,
      deliveryDeadline: updatedOrder.deliveryDeadline,
      updatedBy: updatedOrder.updatedBy?.name || updatedById,
    });

    return updatedOrder;
  } catch (error) {
    console.error('🔥 ERROR in updateCurtainOrderDeliveryDeadline');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
};
const getWorkerPaymentReport = async (
  startDate,
  endDate,
  filters = {},
  userId,
) => {
  console.log('🚀 getWorkerPaymentReport START');
  console.log('📅 Start Date:', startDate);
  console.log('📅 End Date:', endDate);
  console.log('🔍 Filters:', filters);
  console.log('👤 Requested By:', userId);

  try {
    /* ---------------- VALIDATION ---------------- */
    if (!startDate || !endDate) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Start date and end date are required',
      );
    }

    /* ---------------- PARSE DATES ---------------- */
    let parsedStartDate;
    let parsedEndDate;

    const parseDate = (date) => {
      if (date instanceof Date) return date;
      if (typeof date === 'string') return new Date(date);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid date format. Must be a valid date.',
      );
    };

    try {
      parsedStartDate = parseDate(startDate);
      parsedEndDate = parseDate(endDate);

      parsedStartDate.setHours(0, 0, 0, 0);
      parsedEndDate.setHours(23, 59, 59, 999);
    } catch (error) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid date format. Please provide valid dates.',
      );
    }

    if (parsedStartDate > parsedEndDate) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Start date cannot be after end date',
      );
    }

    console.log('✅ Date range validated:', {
      start: parsedStartDate,
      end: parsedEndDate,
    });

    /* ---------------- BUILD FILTER CONDITIONS ---------------- */
    const {
      paymentStatus,
      workerId,
      shopId,
      movementTypeId,
      includePaid = true,
      includeUnpaid = true,
      workerType = 'ALL', // 'THIN', 'THICK', 'ALL'
    } = filters;

    // Base where clause for CurtainOrder - only include orders with measurements that have workers
    const orderWhereClause = {
      createdAt: {
        gte: parsedStartDate,
        lte: parsedEndDate,
      },
      measurements: {
        some: {
          OR: [
            { thinWorkerId: { not: null } },
            { thickWorkerId: { not: null } },
          ],
        },
      },
    };

    if (shopId) {
      orderWhereClause.ShopId = shopId;
    }

    if (movementTypeId) {
      orderWhereClause.movementTypeId = movementTypeId;
    }

    // Add worker-specific filter
    if (workerId) {
      orderWhereClause.measurements = {
        some: {
          OR: [{ thinWorkerId: workerId }, { thickWorkerId: workerId }],
        },
      };
    }

    /* ---------------- FETCH ORDERS WITH MEASUREMENTS ---------------- */
    console.log('🔍 Fetching orders with worker assignments...');

    const orders = await prisma.curtainOrder.findMany({
      where: orderWhereClause,
      include: {
        movementType: {
          select: {
            id: true,
            name: true,
          },
        },
        Shop: {
          select: {
            id: true,
            name: true,
          },
        },
        measurements: {
          where: {
            OR: [
              { thinWorkerId: { not: null } },
              { thickWorkerId: { not: null } },
            ],
          },
          include: {
            thinWorker: {
              select: {
                id: true,
                name: true,
                phone: true,
                role: true,
              },
            },
            thickWorker: {
              select: {
                id: true,
                name: true,
                phone: true,
                role: true,
              },
            },
            thinProduct: {
              select: {
                id: true,
                name: true,
                productCode: true,
              },
            },
            thickProduct: {
              select: {
                id: true,
                name: true,
                productCode: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`✅ Found ${orders.length} orders with worker assignments`);

    /* ---------------- PROCESS WORKER DATA ONLY ---------------- */
    const reportData = {
      summary: {
        totalOrders: orders.length,
        totalMeasurements: 0,
        totalThinWorkerAmount: 0,
        totalThickWorkerAmount: 0,
        totalWorkerAmount: 0,
        paidThinWorkers: 0,
        unpaidThinWorkers: 0,
        paidThickWorkers: 0,
        unpaidThickWorkers: 0,
        totalPaidAmount: 0,
        totalUnpaidAmount: 0,
        totalWorkerJobs: 0,
        totalWorkerMeters: 0,
        totalUniqueWorkers: 0,
      },
      workers: {
        thin: {},
        thick: {},
      },
      measurements: [], // Flat list of measurements with worker details
      dateRange: {
        start: parsedStartDate,
        end: parsedEndDate,
      },
      generatedAt: new Date(),
      generatedBy: userId,
    };

    // Process measurements to extract worker data
    orders.forEach((order) => {
      order.measurements.forEach((measurement) => {
        const measurementWorkerData = {
          measurementId: measurement.id,
          orderId: order.id,
          orderDate: order.createdAt,
          roomName: measurement.roomName,
          totalWorkerMeter: measurement.totalWorkerMeter || 0,
          workerPrice: measurement.workerPrice || 0,
          shopName: order.Shop?.name || 'N/A',
          movementType: order.movementType?.name || 'N/A',
        };

        // Process Thin Worker
        if (measurement.thinWorker) {
          const workerId = measurement.thinWorker.id;

          // Update measurement data with thin worker info
          const thinWorkerData = {
            ...measurementWorkerData,
            workerType: 'THIN',
            workerId: measurement.thinWorker.id,
            workerName: measurement.thinWorker.name,
            workerPhone: measurement.thinWorker.phone,
            workerRole: measurement.thinWorker.role,
            isPaid: measurement.thinWorkerPaid || false,
            paidDate: measurement.thinWorkerPaidDate,
            productName: measurement.thinProduct?.name,
            productCode: measurement.thinProduct?.productCode,
          };

          reportData.measurements.push(thinWorkerData);

          // Update summary
          reportData.summary.totalMeasurements++;
          reportData.summary.totalThinWorkerAmount +=
            measurement.workerPrice || 0;
          reportData.summary.totalWorkerAmount += measurement.workerPrice || 0;
          reportData.summary.totalWorkerMeters +=
            measurement.totalWorkerMeter || 0;

          if (measurement.thinWorkerPaid) {
            reportData.summary.paidThinWorkers++;
            reportData.summary.totalPaidAmount += measurement.workerPrice || 0;
          } else {
            reportData.summary.unpaidThinWorkers++;
            reportData.summary.totalUnpaidAmount +=
              measurement.workerPrice || 0;
          }

          // Group by worker
          if (!reportData.workers.thin[workerId]) {
            reportData.workers.thin[workerId] = {
              workerId: measurement.thinWorker.id,
              workerName: measurement.thinWorker.name,
              workerPhone: measurement.thinWorker.phone,
              workerRole: measurement.thinWorker.role,
              totalJobs: 0,
              totalMeters: 0,
              totalAmount: 0,
              paidAmount: 0,
              unpaidAmount: 0,
              jobs: [],
            };
          }

          const workerStats = reportData.workers.thin[workerId];
          workerStats.totalJobs++;
          workerStats.totalMeters += measurement.totalWorkerMeter || 0;
          workerStats.totalAmount += measurement.workerPrice || 0;

          if (measurement.thinWorkerPaid) {
            workerStats.paidAmount += measurement.workerPrice || 0;
          } else {
            workerStats.unpaidAmount += measurement.workerPrice || 0;
          }

          workerStats.jobs.push({
            measurementId: measurement.id,
            orderId: order.id,
            orderDate: order.createdAt,
            roomName: measurement.roomName,
            meter: measurement.totalWorkerMeter || 0,
            amount: measurement.workerPrice || 0,
            productName: measurement.thinProduct?.name,
            productCode: measurement.thinProduct?.productCode,
            paid: measurement.thinWorkerPaid,
            paidDate: measurement.thinWorkerPaidDate,
          });
        }

        // Process Thick Worker
        if (measurement.thickWorker) {
          const workerId = measurement.thickWorker.id;

          // Update measurement data with thick worker info
          const thickWorkerData = {
            ...measurementWorkerData,
            workerType: 'THICK',
            workerId: measurement.thickWorker.id,
            workerName: measurement.thickWorker.name,
            workerPhone: measurement.thickWorker.phone,
            workerRole: measurement.thickWorker.role,
            isPaid: measurement.thickWorkerPaid || false,
            paidDate: measurement.thickWorkerPaidDate,
            productName: measurement.thickProduct?.name,
            productCode: measurement.thickProduct?.productCode,
          };

          reportData.measurements.push(thickWorkerData);

          // Update summary
          reportData.summary.totalMeasurements++;
          reportData.summary.totalThickWorkerAmount +=
            measurement.workerPrice || 0;
          reportData.summary.totalWorkerAmount += measurement.workerPrice || 0;
          reportData.summary.totalWorkerMeters +=
            measurement.totalWorkerMeter || 0;

          if (measurement.thickWorkerPaid) {
            reportData.summary.paidThickWorkers++;
            reportData.summary.totalPaidAmount += measurement.workerPrice || 0;
          } else {
            reportData.summary.unpaidThickWorkers++;
            reportData.summary.totalUnpaidAmount +=
              measurement.workerPrice || 0;
          }

          // Group by worker
          if (!reportData.workers.thick[workerId]) {
            reportData.workers.thick[workerId] = {
              workerId: measurement.thickWorker.id,
              workerName: measurement.thickWorker.name,
              workerPhone: measurement.thickWorker.phone,
              workerRole: measurement.thickWorker.role,
              totalJobs: 0,
              totalMeters: 0,
              totalAmount: 0,
              paidAmount: 0,
              unpaidAmount: 0,
              jobs: [],
            };
          }

          const workerStats = reportData.workers.thick[workerId];
          workerStats.totalJobs++;
          workerStats.totalMeters += measurement.totalWorkerMeter || 0;
          workerStats.totalAmount += measurement.workerPrice || 0;

          if (measurement.thickWorkerPaid) {
            workerStats.paidAmount += measurement.workerPrice || 0;
          } else {
            workerStats.unpaidAmount += measurement.workerPrice || 0;
          }

          workerStats.jobs.push({
            measurementId: measurement.id,
            orderId: order.id,
            orderDate: order.createdAt,
            roomName: measurement.roomName,
            meter: measurement.totalWorkerMeter || 0,
            amount: measurement.workerPrice || 0,
            productName: measurement.thickProduct?.name,
            productCode: measurement.thickProduct?.productCode,
            paid: measurement.thickWorkerPaid,
            paidDate: measurement.thickWorkerPaidDate,
          });
        }
      });
    });

    // Filter measurements based on worker type and payment status
    if (workerType === 'THIN') {
      reportData.measurements = reportData.measurements.filter(
        (m) => m.workerType === 'THIN',
      );
    } else if (workerType === 'THICK') {
      reportData.measurements = reportData.measurements.filter(
        (m) => m.workerType === 'THICK',
      );
    }

    if (!includePaid && includeUnpaid) {
      reportData.measurements = reportData.measurements.filter(
        (m) => !m.isPaid,
      );
    } else if (includePaid && !includeUnpaid) {
      reportData.measurements = reportData.measurements.filter((m) => m.isPaid);
    }

    if (paymentStatus === 'PAID') {
      reportData.measurements = reportData.measurements.filter((m) => m.isPaid);
    } else if (paymentStatus === 'UNPAID') {
      reportData.measurements = reportData.measurements.filter(
        (m) => !m.isPaid,
      );
    }

    // Convert workers objects to arrays
    reportData.workers.thin = Object.values(reportData.workers.thin);
    reportData.workers.thick = Object.values(reportData.workers.thick);

    // Calculate final summary metrics
    reportData.summary.totalWorkerJobs =
      reportData.workers.thin.reduce((acc, w) => acc + w.totalJobs, 0) +
      reportData.workers.thick.reduce((acc, w) => acc + w.totalJobs, 0);

    reportData.summary.totalUniqueWorkers =
      reportData.workers.thin.length + reportData.workers.thick.length;

    console.log('✅ Worker Payment Report generated:', {
      totalMeasurements: reportData.summary.totalMeasurements,
      totalUniqueWorkers: reportData.summary.totalUniqueWorkers,
      totalWorkerAmount: reportData.summary.totalWorkerAmount,
      totalPaid: reportData.summary.totalPaidAmount,
      totalUnpaid: reportData.summary.totalUnpaidAmount,
    });

    return reportData;
  } catch (error) {
    console.error('🔥 ERROR in getWorkerPaymentReport');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
};

// Additional helper function to mark worker as paid
const markWorkerAsPaid = async (
  measurementId,
  workerType, // 'THIN' or 'THICK'
  paidById,
) => {
  console.log('🚀 markWorkerAsPaid START');
  console.log('📦 Measurement ID:', measurementId);
  console.log('👷 Worker Type:', workerType);
  console.log('👤 Paid By:', paidById);

  try {
    /* ---------------- VALIDATION ---------------- */
    if (!measurementId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Measurement ID is required');
    }

    if (!workerType || !['THIN', 'THICK'].includes(workerType)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Valid worker type (THIN or THICK) is required',
      );
    }

    /* ---------------- CHECK MEASUREMENT EXISTS ---------------- */
    const existingMeasurement = await prisma.curtainMeasurement.findUnique({
      where: { id: measurementId },
      include: {
        thinWorker: true,
        thickWorker: true,
        order: true,
      },
    });

    if (!existingMeasurement) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Curtain measurement not found');
    }

    // Check if the worker type is assigned to this measurement
    if (workerType === 'THIN' && !existingMeasurement.thinWorkerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No thin worker assigned to this measurement',
      );
    }

    if (workerType === 'THICK' && !existingMeasurement.thickWorkerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No thick worker assigned to this measurement',
      );
    }

    // Check if already paid
    if (workerType === 'THIN' && existingMeasurement.thinWorkerPaid) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Thin worker is already marked as paid',
      );
    }

    if (workerType === 'THICK' && existingMeasurement.thickWorkerPaid) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Thick worker is already marked as paid',
      );
    }

    /* ---------------- UPDATE WORKER PAYMENT STATUS ---------------- */
    const updateData = {
      updatedAt: new Date(),
    };

    if (workerType === 'THIN') {
      updateData.thinWorkerPaid = true;
      updateData.thinWorkerPaidDate = new Date();
    } else {
      updateData.thickWorkerPaid = true;
      updateData.thickWorkerPaidDate = new Date();
    }

    const updatedMeasurement = await prisma.curtainMeasurement.update({
      where: { id: measurementId },
      data: updateData,
      include: {
        thinWorker: {
          select: {
            id: true,
            name: true,
          },
        },
        thickWorker: {
          select: {
            id: true,
            name: true,
          },
        },
        order: {
          select: {
            id: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    console.log('✅ Worker payment marked successfully:', {
      measurementId: updatedMeasurement.id,
      workerType,
      workerName:
        workerType === 'THIN'
          ? updatedMeasurement.thinWorker?.name
          : updatedMeasurement.thickWorker?.name,
      paidDate:
        workerType === 'THIN'
          ? updatedMeasurement.thinWorkerPaidDate
          : updatedMeasurement.thickWorkerPaidDate,
    });

    return updatedMeasurement;
  } catch (error) {
    console.error('🔥 ERROR in markWorkerAsPaid');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);

    // If it's a Prisma validation error, it might be because the client needs to be regenerated
    if (error.name === 'PrismaClientValidationError') {
      console.error(
        '⚠️ This might be a Prisma client issue. Try running: npx prisma generate',
      );
    }

    throw error;
  }
};

module.exports = {
  // CurtainOrder
  markWorkerAsPaid,
  getWorkerPaymentReport,
  updateCurtainOrderDeliveryDeadline,
  updateCurtainOrderPayment,
  updateCurtainOrderStatus,
  updateCurtainOrderShop,
  createCurtainMeasurement,
  getCurtainOrderById,
  getCurtainOrderByCriteria,
  createCurtainOrder,
  getAllCurtainOrders,
  updateCurtainOrder,
  deleteCurtainOrder,
  deleteCurtainMeasurement,
  getCurtainOrdersByCustomerId,
  getCurtainOrdersByCreatedBy,
  createsecondCurtainMeasurement,
  updatesecondCurtainOrderShop,
  getthikthinCurtainOrderById,
  getshatterCurtainOrderById,
  getPendingCurtainOrders,
};
