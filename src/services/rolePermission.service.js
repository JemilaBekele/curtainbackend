const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

/**
 * Check if role-permission relationship exists
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<boolean>}
 */
const rolePermissionExists = async (roleId, permissionId) => {
  const rolePermission = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId,
        permissionId,
      },
    },
  });

  return !!rolePermission;
};

/**
 * Create a role-permission relationship
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<RolePermission>}
 */
const createRolePermission = async (data) => {
  // Validate input
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data parameter: expected an object');
  }
  if (!data.roleId) {
    throw new Error('roleId is required');
  }
  if (!data.permissionIds || !Array.isArray(data.permissionIds)) {
    throw new Error('permissionIds is required and must be an array');
  }

  try {
    // First, get all existing role-permission relationships for this role
    const existingRolePermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: data.roleId,
      },
      select: {
        permissionId: true,
      },
    });

    const existingPermissionIds = existingRolePermissions.map(
      (rp) => rp.permissionId,
    );

    // Determine which permissions need to be added and which need to be removed
    const permissionsToAdd = data.permissionIds.filter(
      (pid) => !existingPermissionIds.includes(pid),
    );
    const permissionsToRemove = existingPermissionIds.filter(
      (pid) => !data.permissionIds.includes(pid),
    );

    // Use a transaction to ensure all operations succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
      // Remove permissions that are no longer needed
      if (permissionsToRemove.length > 0) {
        await tx.rolePermission.deleteMany({
          where: {
            roleId: data.roleId,
            permissionId: {
              in: permissionsToRemove,
            },
          },
        });
      }

      // Add new permissions
      const createdRolePermissions = await Promise.all(
        permissionsToAdd.map((permissionId) =>
          tx.rolePermission.create({
            data: {
              roleId: data.roleId,
              permissionId,
            },
          }),
        ),
      );

      return {
        added: createdRolePermissions,
        removed: permissionsToRemove.length,
      };
    });

    return result;
  } catch (error) {
    throw new Error('Failed to update role permissions');
  }
};

const assignRolePermissions = async (data) => {
  // Validate input
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data parameter: expected an object');
  }
  if (!data.roleId) {
    throw new Error('roleId is required');
  }
  if (!data.permissionIds || !Array.isArray(data.permissionIds)) {
    throw new Error('permissionIds is required and must be an array');
  }

  try {
    // First, get all existing role-permission relationships for this role
    const existingRolePermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: data.roleId,
      },
      select: {
        permissionId: true,
      },
    });

    const existingPermissionIds = existingRolePermissions.map(
      (rp) => rp.permissionId,
    );

    // Filter out permissions that already exist for this role
    const newPermissionsToAdd = data.permissionIds.filter(
      (pid) => !existingPermissionIds.includes(pid),
    );

    // If no new permissions to add, return early
    if (newPermissionsToAdd.length === 0) {
      return {
        message: 'All permissions already assigned to this role',
        added: [],
        existing: existingPermissionIds,
      };
    }

    // Use a transaction to ensure all operations succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
      // Add only new permissions
      const createdRolePermissions = await Promise.all(
        newPermissionsToAdd.map((permissionId) =>
          tx.rolePermission.create({
            data: {
              roleId: data.roleId,
              permissionId,
            },
          }),
        ),
      );

      return {
        added: createdRolePermissions.map((rp) => rp.permissionId),
        existing: existingPermissionIds,
      };
    });

    return {
      message: 'Successfully assigned new permissions',
      ...result,
    };
  } catch (error) {
    throw new Error(`Failed to assign role permissions: ${error.message}`);
  }
};
const updateAssignedRolePermissions = async (data) => {
  // Validate
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data: expected an object');
  }
  if (!data.roleId) {
    throw new Error('roleId is required');
  }
  if (!Array.isArray(data.permissionIds)) {
    throw new Error('permissionIds must be an array');
  }

  try {
    // Get existing role permissions
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: data.roleId },
      select: { permissionId: true },
    });

    const existingIds = existing.map((p) => p.permissionId);

    // Determine changes
    const permissionsToAdd = data.permissionIds.filter(
      (pid) => !existingIds.includes(pid),
    );

    const permissionsToRemove = existingIds.filter(
      (pid) => !data.permissionIds.includes(pid),
    );

    // TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      // Remove permissions not in the new list
      if (permissionsToRemove.length > 0) {
        await tx.rolePermission.deleteMany({
          where: {
            roleId: data.roleId,
            permissionId: { in: permissionsToRemove },
          },
        });
      }

      // Add new permissions
      const addedPermissions = await Promise.all(
        permissionsToAdd.map((pid) =>
          tx.rolePermission.create({
            data: {
              roleId: data.roleId,
              permissionId: pid,
            },
          }),
        ),
      );

      return {
        added: addedPermissions.map((rp) => rp.permissionId),
        removed: permissionsToRemove,
      };
    });

    return {
      message: 'Role permissions updated successfully',
      ...result,
      finalPermissions: data.permissionIds,
    };
  } catch (error) {
    throw new Error(`Failed to update role permissions: ${error.message}`);
  }
};
/**
 * Get role-permission relationship by ID
 * @param {string} id
 * @returns {Promise<RolePermission>}
 */
const getRolePermissionById = async (id) => {
  const rolePermission = await prisma.rolePermission.findUnique({
    where: { id },
    include: {
      role: true,
      permission: true,
    },
  });

  if (!rolePermission) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Role-Permission relationship not found',
    );
  }

  return rolePermission;
};

/**
 * Get all role-permission relationships
 * @param {Object} filter - Optional filters
 * @param {Object} options - Query options
 * @returns {Promise<{rolePermissions: RolePermission[], count: number}>}
 */
const getAllRolePermissions = async (filter = {}, options = {}) => {
  const { sortBy, sortOrder } = options;

  const rolePermissions = await prisma.rolePermission.findMany({
    where: filter,
    orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
    include: {
      role: true,
      permission: true,
    },
  });

  return {
    rolePermissions,
    count: rolePermissions.length,
  };
};

/**
 * Delete role-permission relationship by ID
 * @param {string} id
 * @returns {Promise<{message: string}>}
 */
const deleteRolePermission = async (id) => {
  await getRolePermissionById(id);

  await prisma.rolePermission.delete({
    where: { id },
  });

  return { message: 'Role-Permission relationship deleted successfully' };
};

/**
 * Delete role-permission relationship by role and permission IDs
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<{message: string}>}
 */
const deleteRolePermissionByRelation = async (roleId, permissionId) => {
  const rolePermission = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId,
        permissionId,
      },
    },
  });

  if (!rolePermission) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Role-Permission relationship not found',
    );
  }

  await prisma.rolePermission.delete({
    where: { id: rolePermission.id },
  });

  return { message: 'Role-Permission relationship deleted successfully' };
};

module.exports = {
  rolePermissionExists,
  createRolePermission,
  getRolePermissionById,
  getAllRolePermissions,
  deleteRolePermission,
  deleteRolePermissionByRelation,
  assignRolePermissions,
  updateAssignedRolePermissions,
};
