const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Get CurtainWorkerLog by ID (helper function)
const getCurtainWorkerLogById = async (id) => {
  const curtainWorkerLog = await prisma.curtainWorkerLog.findUnique({
    where: { id },
    include: {
      curtainMeasurement: true,
      worker: true,
      workerlogcreatedBy: true,
      shopProductVariant: {
        include: {
          shopStock: {
            include: {
              shop: true,
              product: true,
            },
          },
        },
      },
    },
  });
  return curtainWorkerLog;
};
// 1. Create CurtainWorkerLog
const createCurtainWorkerLog = async (logBody) => {
  // Validate that curtain measurement exists
  const curtainMeasurement = await prisma.curtainMeasurement.findUnique({
    where: { id: logBody.curtainMeasurementId },
  });

  if (!curtainMeasurement) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Curtain measurement not found');
  }

  // Determine which worker to use based on workerType
  let workerId = null;

  if (logBody.workerType === 'THICK') {
    workerId = curtainMeasurement.thickWorkerId;
    if (!workerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No thick worker assigned to this curtain measurement',
      );
    }
  } else if (logBody.workerType === 'THIN') {
    workerId = curtainMeasurement.thinWorkerId;
    if (!workerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No thin worker assigned to this curtain measurement',
      );
    }
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid worker type');
  }

  // Validate that the worker exists
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
  });

  if (!worker) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Worker not found');
  }

  // If shopProductVariantId is provided, validate it exists and belongs to the correct shop
  if (logBody.shopProductVariantId) {
    const shopProductVariant = await prisma.shopProductVariant.findUnique({
      where: { id: logBody.shopProductVariantId },
      include: {
        shopStock: {
          include: {
            shop: true,
          },
        },
      },
    });

    if (!shopProductVariant) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Shop product variant not found',
      );
    }
  }

  // Remove workerId from logBody if present and use the one from measurement
  const { workerId: removedWorkerId, ...cleanLogBody } = logBody;

  const curtainWorkerLog = await prisma.curtainWorkerLog.create({
    data: {
      ...cleanLogBody,
      workerId, // Use worker ID from measurement
    },
    include: {
      curtainMeasurement: true,
      worker: true,
      workerlogcreatedBy: true,
      shopProductVariant: true, // Include the variant in the response
    },
  });

  return curtainWorkerLog;
};

// 2. Update CurtainWorkerLog
const updateCurtainWorkerLog = async (id, updateBody) => {
  const existingLog = await getCurtainWorkerLogById(id);

  if (!existingLog) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain worker log not found');
  }

  // If updating curtainMeasurementId, validate it exists
  if (updateBody.curtainMeasurementId) {
    const curtainMeasurement = await prisma.curtainMeasurement.findUnique({
      where: { id: updateBody.curtainMeasurementId },
    });

    if (!curtainMeasurement) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Curtain measurement not found',
      );
    }
  }

  // If updating workerType, we need to update workerId based on the measurement
  if (updateBody.workerType) {
    // Get the current curtain measurement
    const measurementId =
      updateBody.curtainMeasurementId || existingLog.curtainMeasurementId;

    const curtainMeasurement = await prisma.curtainMeasurement.findUnique({
      where: { id: measurementId },
    });

    if (!curtainMeasurement) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Curtain measurement not found',
      );
    }

    // Determine worker based on new workerType
    let newWorkerId = null;
    if (updateBody.workerType === 'THICK') {
      newWorkerId = curtainMeasurement.thickWorkerId;
    } else if (updateBody.workerType === 'THIN') {
      newWorkerId = curtainMeasurement.thinWorkerId;
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid worker type');
    }

    if (!newWorkerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No ${updateBody.workerType.toLowerCase()} worker assigned to this curtain measurement`,
      );
    }

    // Validate that the worker exists
    const worker = await prisma.user.findUnique({
      where: { id: newWorkerId },
    });

    if (!worker) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Worker not found');
    }

    // Set the new workerId
    updateBody.workerId = newWorkerId;
  }

  // If updating shopProductVariantId, validate it exists
  if (updateBody.shopProductVariantId) {
    const shopProductVariant = await prisma.shopProductVariant.findUnique({
      where: { id: updateBody.shopProductVariantId },
      include: {
        shopStock: {
          include: {
            shop: true,
          },
        },
      },
    });

    if (!shopProductVariant) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Shop product variant not found',
      );
    }

    // Get the dimensions to validate against
    const heightToCheck =
      updateBody.heightmeterAssigned !== undefined
        ? updateBody.heightmeterAssigned
        : existingLog.heightmeterAssigned;

    const widthToCheck =
      updateBody.widthmeterAssigned !== undefined
        ? updateBody.widthmeterAssigned
        : existingLog.widthmeterAssigned;

    const quantityToCheck =
      updateBody.quantityAssigned !== undefined
        ? updateBody.quantityAssigned
        : existingLog.quantityAssigned;

    // Validate that the variant has sufficient quantity
    const quantityToAssign = quantityToCheck || 1;
    if (shopProductVariant.quantity < quantityToAssign) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Insufficient variant stock. Available: ${shopProductVariant.quantity}, Requested: ${quantityToAssign}`,
      );
    }
  }

  // Remove any workerId from updateBody if it was provided (we don't want to override from frontend)
  // But if we've already set it above, we want to keep it
  if (!updateBody.workerId) {
    delete updateBody.workerId;
  }

  const updatedLog = await prisma.curtainWorkerLog.update({
    where: { id },
    data: updateBody,
    include: {
      curtainMeasurement: true,
      worker: true,
      workerlogcreatedBy: true,
      shopProductVariant: true, // Include the variant in the response
    },
  });

  return updatedLog;
};

// 3. View CurtainWorkerLogs by Employee ID
const getCurtainWorkerLogsByEmployee = async (workerId) => {
  // Validate that worker exists
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
  });

  if (!worker) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Worker not found');
  }

  const curtainWorkerLogs = await prisma.curtainWorkerLog.findMany({
    where: { workerId },
    include: {
      curtainMeasurement: true,
      workerlogcreatedBy: true,
      shopProductVariant: {
        include: {
          shopStock: {
            include: {
              shop: true,
              product: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    curtainWorkerLogs,
    count: curtainWorkerLogs.length,
    worker: {
      id: worker.id,
      name: worker.name,
      email: worker.email,
    },
  };
};

// 4. View CurtainWorkerLogs by Curtain Measurement ID
const getCurtainWorkerLogsByMeasurement = async (curtainMeasurementId) => {
  // Validate that curtain measurement exists
  const curtainMeasurement = await prisma.curtainMeasurement.findUnique({
    where: { id: curtainMeasurementId },
  });

  if (!curtainMeasurement) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain measurement not found');
  }

  const curtainWorkerLogs = await prisma.curtainWorkerLog.findMany({
    where: { curtainMeasurementId },
    include: {
      worker: true,
      workerlogcreatedBy: true,
      shopProductVariant: {
        include: {
          shopStock: {
            include: {
              shop: true,
              product: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Calculate summary statistics with the updated field names
  const summary = {
    totalWidthAssigned: curtainWorkerLogs.reduce(
      (sum, log) => sum + (log.widthmeterAssigned || 0),
      0,
    ),
    totalWidthCompleted: curtainWorkerLogs.reduce(
      (sum, log) => sum + (log.widthmeterCompleted || 0),
      0,
    ),
    totalHeightAssigned: curtainWorkerLogs.reduce(
      (sum, log) => sum + (log.heightmeterAssigned || 0),
      0,
    ),
    totalHeightCompleted: curtainWorkerLogs.reduce(
      (sum, log) => sum + (log.heightmeterCompleted || 0),
      0,
    ),
    totalQuantityAssigned: curtainWorkerLogs.reduce(
      (sum, log) => sum + (log.quantityAssigned || 0),
      0,
    ),
    totalQuantityCompleted: curtainWorkerLogs.reduce(
      (sum, log) => sum + (log.quantityCompleted || 0),
      0,
    ),
    thickWorkersCount: curtainWorkerLogs.filter(
      (log) => log.workerType === 'THICK',
    ).length,
    thinWorkersCount: curtainWorkerLogs.filter(
      (log) => log.workerType === 'THIN',
    ).length,
  };

  return {
    curtainMeasurement: {
      id: curtainMeasurement.id,
      // Add other relevant curtain measurement fields as needed
    },
    curtainWorkerLogs,
    summary,
    count: curtainWorkerLogs.length,
  };
};
// Approve curtain worker log (with stock withdrawal from shop product variant)
// Approve curtain worker log (with stock withdrawal from shop product variant)
const approveCurtainWorkerLog = async (logId, userId) => {
  console.log('🚀 Starting approveCurtainWorkerLog function');
  console.log('📝 Input params:', { logId, userId });

  try {
    const log = await prisma.curtainWorkerLog.findUnique({
      where: { id: logId },
      include: {
        curtainMeasurement: {
          include: {
            thickProduct: true,
            thinProduct: true,
            order: {
              include: {
                Shop: true,
              },
            },
          },
        },
        worker: true,
        shopProductVariant: {
          include: {
            shopStock: {
              include: {
                shop: true,
              },
            },
          },
        },
      },
    });

    console.log('📊 Retrieved log:', JSON.stringify(log, null, 2));

    if (!log) {
      console.log('❌ Log not found for id:', logId);
      throw new ApiError(httpStatus.NOT_FOUND, 'Curtain worker log not found');
    }

    console.log('📈 Log status:', log.status);
    if (log.status !== 'PENDING') {
      console.log('❌ Log not in PENDING status');
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Log is already ${log.status.toLowerCase()}`,
      );
    }

    console.log('📏 Assigned measurements:', {
      widthmeterAssigned: log.widthmeterAssigned,
      heightmeterAssigned: log.heightmeterAssigned,
      quantityAssigned: log.quantityAssigned,
    });

    if (
      !log.widthmeterAssigned &&
      !log.heightmeterAssigned &&
      !log.quantityAssigned
    ) {
      console.log('❌ No assigned measurements found');
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No assigned measurements to withdraw from stock',
      );
    }

    // Check if there's already a shopProductVariant associated with this log
    if (!log.shopProductVariantId) {
      console.log('❌ No shop product variant associated with this log');
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No shop product variant associated with this worker log. Please assign a variant first.',
      );
    }

    console.log('🔍 Shop Product Variant found:', {
      variantId: log.shopProductVariant.id,
      height: log.shopProductVariant.height,
      width: log.shopProductVariant.width,
      currentQuantity: log.shopProductVariant.quantity,
      shopStockId: log.shopProductVariant.shopStockId,
    });

    // Get the shop ID from the variant's shop stock
    const shopId = log.shopProductVariant.shopStock?.shopId;
    console.log('🏪 Shop ID:', shopId);

    if (!shopId) {
      console.log('❌ No shop ID found in shop product variant');
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No shop associated with this product variant',
      );
    }

    // Get the product ID from the curtain measurement based on worker type
    let productId = null;
    console.log('👷 Worker type:', log.workerType);

    if (log.workerType === 'THICK') {
      productId = log.curtainMeasurement.thickProductId;
      console.log('🔍 Thick product ID:', productId);
    } else if (log.workerType === 'THIN') {
      productId = log.curtainMeasurement.thinProductId;
      console.log('🔍 Thin product ID:', productId);
    } else {
      console.log('❌ Unsupported worker type:', log.workerType);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Unsupported worker type: ${log.workerType}`,
      );
    }

    if (!productId) {
      console.log('❌ No product ID found for worker type:', log.workerType);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No product associated with this ${log.workerType} curtain measurement`,
      );
    }

    // Validate that quantityAssigned is exactly 1 for cutting logic
    const quantityToCut = log.quantityAssigned || 1;

    if (quantityToCut !== 1) {
      console.log('❌ Invalid quantity for cutting:', quantityToCut);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Curtain cutting only supports cutting 1 piece at a time. Requested: ${quantityToCut}`,
      );
    }

    console.log('🔄 Starting transaction for curtain cutting');
    const result = await prisma.$transaction(async (tx) => {
      // Check if variant has sufficient quantity (at least 1)
      if (log.shopProductVariant.quantity < 1) {
        console.log('❌ Insufficient variant stock');
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Insufficient variant stock. Available: ${log.shopProductVariant.quantity}, Required: 1`,
        );
      }

      // STEP 1: Decrement original variant quantity by 1
      console.log('✏️ Step 1: Decrementing original variant quantity by 1');
      const updatedVariant = await tx.shopProductVariant.update({
        where: { id: log.shopProductVariant.id },
        data: {
          quantity: { decrement: 1 },
        },
      });
      console.log('✅ Original variant updated:', updatedVariant);

      // STEP 2: Calculate remaining piece dimensions
      const originalWidth = log.shopProductVariant.width;
      const originalHeight = log.shopProductVariant.height;
      const cutWidth = log.widthmeterAssigned;
      const cutHeight = log.heightmeterAssigned;

      const remainingWidth = originalWidth - cutWidth;
      const remainingHeight = originalHeight - cutHeight;

      console.log('📐 Cutting calculations:', {
        originalWidth,
        originalHeight,
        cutWidth,
        cutHeight,
        remainingWidth,
        remainingHeight,
      });

      // Validate remaining dimensions are positive
      if (remainingWidth <= 0 || remainingHeight <= 0) {
        console.log('❌ Invalid remaining dimensions:', {
          remainingWidth,
          remainingHeight,
        });
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Remaining piece dimensions would be invalid: ${remainingWidth}x${remainingHeight}. Cut dimensions too large.`,
        );
      }

      // STEP 3: Create or update remaining variant
      console.log('🔍 Step 2: Checking for existing remaining variant');
      const existingRemainingVariant = await tx.shopProductVariant.findFirst({
        where: {
          shopStockId: log.shopProductVariant.shopStockId,
          width: remainingWidth,
          height: remainingHeight,
        },
      });

      let remainingVariant;
      if (existingRemainingVariant) {
        console.log(
          '✅ Existing remaining variant found, incrementing quantity by 1',
        );
        remainingVariant = await tx.shopProductVariant.update({
          where: { id: existingRemainingVariant.id },
          data: {
            quantity: { increment: 1 },
          },
        });
      } else {
        console.log('✅ No existing remaining variant found, creating new one');
        remainingVariant = await tx.shopProductVariant.create({
          data: {
            shopStockId: log.shopProductVariant.shopStockId,
            width: remainingWidth,
            height: remainingHeight,
            quantity: 1,
          },
        });
      }
      console.log('✅ Remaining variant processed:', remainingVariant);

      // Update shop stock total quantity (decrement by 1 since we're only cutting 1 piece)
      console.log('✏️ Updating shop stock total quantity');
      const shopStock = await tx.shopStock.findUnique({
        where: { id: log.shopProductVariant.shopStockId },
      });

      if (shopStock) {
        await tx.shopStock.update({
          where: { id: shopStock.id },
          data: {
            quantity: { decrement: 1 },
          },
        });
        console.log('✅ Shop stock total quantity updated');
      }

      const invoiceNo = `CUT-${log.workerType}-${Date.now()}`;
      console.log('🧾 Invoice number:', invoiceNo);

      // Create stock ledger entry for the cut piece
      console.log('📝 Creating stock ledger entry for cut piece');
      const ledgerEntry = await tx.stockLedger.create({
        data: {
          productId,
          shopId,
          invoiceNo,
          movementType: 'OUT',
          quantity: 1,
          height: log.heightmeterAssigned,
          width: log.widthmeterAssigned,
          unitOfMeasureId:
            shopStock?.unitOfMeasureId ||
            log.shopProductVariant.shopStock?.unitOfMeasureId,
          reference: `CUT-${log.workerType}-${log.worker?.name || 'Unknown'}`,
          userId,
          notes: `Cut ${log.heightmeterAssigned}x${log.widthmeterAssigned} piece from original ${originalHeight}x${originalWidth} variant. Remaining piece: ${remainingHeight}x${remainingWidth}`,
          movementDate: new Date(),
        },
      });
      console.log('✅ Ledger entry created:', ledgerEntry.id);

      // Create stock ledger entry for the remaining piece (if needed for tracking)
      if (!existingRemainingVariant) {
        console.log(
          '📝 Creating stock ledger entry for remaining piece (inventory adjustment)',
        );
        await tx.stockLedger.create({
          data: {
            productId,
            shopId,
            invoiceNo: `${invoiceNo}-REMAINING`,
            movementType: 'IN',
            quantity: 1,
            height: remainingHeight,
            width: remainingWidth,
            unitOfMeasureId:
              shopStock?.unitOfMeasureId ||
              log.shopProductVariant.shopStock?.unitOfMeasureId,
            reference: `REMAINING-PIECE-${log.workerType}`,
            userId,
            notes: `Remaining piece created from cutting ${originalHeight}x${originalWidth} variant. New dimensions: ${remainingHeight}x${remainingWidth}`,
            movementDate: new Date(),
          },
        });
      }

      // Update curtain worker log status to APPROVED
      console.log('✏️ Updating curtain worker log status to APPROVED');
      const updatedLog = await tx.curtainWorkerLog.update({
        where: { id: logId },
        data: {
          status: 'APPROVED',
        },
        include: {
          curtainMeasurement: true,
          worker: true,
          workerlogcreatedBy: true,
          shopProductVariant: true,
        },
      });
      console.log('✅ Curtain worker log updated');

      // Create system log entry
      console.log('📝 Creating system log entry');
      await tx.log.create({
        data: {
          action: `Approved curtain cutting log for ${log.workerType} worker${
            log.worker?.name ? ` - ${log.worker.name}` : ''
          }. Cut 1 piece of ${log.heightmeterAssigned}x${
            log.widthmeterAssigned
          } from variant ${
            log.shopProductVariant.id
          } (${originalHeight}x${originalWidth}). Created remaining piece ${remainingHeight}x${remainingWidth}.`,
          userId,
        },
      });
      console.log('✅ System log entry created');

      console.log('🎉 Transaction completed successfully');
      return {
        ...updatedLog,
        cuttingDetails: {
          originalVariant: {
            id: log.shopProductVariant.id,
            width: originalWidth,
            height: originalHeight,
          },
          cutPiece: {
            width: cutWidth,
            height: cutHeight,
          },
          remainingPiece: {
            id: remainingVariant.id,
            width: remainingWidth,
            height: remainingHeight,
            quantity: remainingVariant.quantity,
            isNew: !existingRemainingVariant,
          },
        },
      };
    });

    console.log('✅ Function completed successfully');
    return result;
  } catch (error) {
    console.log('❌ Error in approveCurtainWorkerLog:');
    console.log('Error name:', error.name);
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    if (error.code) {
      console.log('Error code:', error.code);
    }
    if (error.meta) {
      console.log('Error meta:', error.meta);
    }

    throw error;
  }
};
// Bulk approve multiple logs at once
const bulkApproveCurtainWorkerLogs = async (logIds, userId) => {
  if (!logIds || logIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No log IDs provided');
  }

  // Use Promise.allSettled to handle all approvals in parallel
  const results = await Promise.allSettled(
    logIds.map(async (logId) => {
      try {
        const result = await approveCurtainWorkerLog(logId, userId);
        return { logId, success: true, result };
      } catch (error) {
        return {
          logId,
          success: false,
          error: error.message,
        };
      }
    }),
  );

  // Separate successful and failed approvals
  const successful = results
    .filter((result) => result.status === 'fulfilled' && result.value.success)
    .map((result) => result.value.result);

  const failed = results
    .filter((result) => result.status === 'fulfilled' && !result.value.success)
    .map((result) => ({
      logId: result.value.logId,
      error: result.value.error,
    }));

  // Handle any unexpected promise rejections
  const rejected = results
    .filter((result) => result.status === 'rejected')
    .map((result) => ({
      logId: 'unknown',
      error: result.reason?.message || 'Unknown error',
    }));

  const allErrors = [...failed, ...rejected];

  return {
    approved: successful.length,
    failed: allErrors.length,
    results: successful,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
};

// Reject curtain worker log (without stock withdrawal)
const rejectCurtainWorkerLog = async (logId, userId, rejectionReason) => {
  const log = await prisma.curtainWorkerLog.findUnique({
    where: { id: logId },
  });

  if (!log) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain worker log not found');
  }

  if (log.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Log is already ${log.status.toLowerCase()}`,
    );
  }

  const updatedLog = await prisma.$transaction(async (tx) => {
    const rejectedLog = await tx.curtainWorkerLog.update({
      where: { id: logId },
      data: {
        status: 'REJECTED',
        note: rejectionReason ? `REJECTED: ${rejectionReason}` : log.note,
      },
      include: {
        curtainMeasurement: true,
        worker: true,
        workerlogcreatedBy: true,
      },
    });

    // Create a log entry for the rejection
    await tx.log.create({
      data: {
        action: `Rejected curtain worker log for ${log.workerType} worker${
          log.worker?.name ? ` - ${log.worker.name}` : ''
        }${rejectionReason ? `: ${rejectionReason}` : ''}`,
        userId,
      },
    });

    return rejectedLog;
  });

  return updatedLog;
};
module.exports = {
  createCurtainWorkerLog,
  updateCurtainWorkerLog,
  getCurtainWorkerLogsByEmployee,
  getCurtainWorkerLogsByMeasurement,
  rejectCurtainWorkerLog,
  bulkApproveCurtainWorkerLogs,
};
