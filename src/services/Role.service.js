const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const rolePermissionService = require('./rolePermission.service');

/**
 * Create a role
 * @param {Object} roleBody
 * @returns {Promise<Role>}
 */
const getRoleByName = async (name) => {
  const role = await prisma.role.findUnique({
    where: { name },
  });

  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  return role;
};

const createRole = async (roleBody) => {
  try {
    const role = await prisma.role.create({
      data: roleBody,
    });
    return role;
  } catch (error) {
    if (error.code === 'P2002') {
      // Prisma unique constraint error
      return getRoleByName(roleBody.name);
    }
    throw new ApiError(httpStatus.BAD_REQUEST, 'Error creating role');
  }
};

/**
 * Get role by ID
 * @param {string} id
 * @param {Object} options - Optional include options
 * @returns {Promise<Role>}
 */

const getRoleById = async (id, options = {}) => {
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      users: options.includeUsers || false,
    },
  });

  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }

  // Get permissions directly without the join table structure
  if (options.includePermissions !== false) {
    const permissions = await prisma.permission.findMany({
      where: {
        roles: {
          some: {
            roleId: id,
          },
        },
      },
    });

    role.permissions = permissions;
  }

  return role;
};

/**
 * Get role by name
 * @param {string} name
 * @returns {Promise<Role>}
 */

/**
 * Get all roles
 * @param {Object} filter - Optional filters
 * @param {Object} options - Query options
 * @returns {Promise<{roles: Role[], count: number}>}
 */
const getAllRoles = async (filter = {}, options = {}) => {
  const { sortBy, sortOrder, includePermissions, includeUsers } = options;

  const roles = await prisma.role.findMany({
    where: filter,
    orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
    include: {
      permissions: includePermissions
        ? {
            include: {
              permission: true,
            },
          }
        : false,
      users: includeUsers || false,
    },
  });

  return {
    roles,
    count: roles.length,
  };
};

/**
 * Update role by ID
 * @param {string} id
 * @param {Object} updateBody
 * @returns {Promise<Role>}
 */
const updateRole = async (id, updateBody) => {
  const existingRole = await getRoleById(id);

  // Check if new name conflicts with existing roles
  if (updateBody.name && updateBody.name !== existingRole.name) {
    const nameExists = await prisma.role.findUnique({
      where: { name: updateBody.name },
    });

    if (nameExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already exists');
    }
  }

  const updatedRole = await prisma.role.update({
    where: { id },
    data: updateBody,
  });

  return updatedRole;
};

const updateRoleWithPermissions = async (roleId, updateBody) => {
  const { name, description, permissionIds = [] } = updateBody;

  // Ensure role exists
  const existingRole = await getRoleById(roleId);

  // Validate unique role name
  if (name && name !== existingRole.name) {
    const nameExists = await prisma.role.findUnique({ where: { name } });
    if (nameExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already exists');
    }
  }

  // 1️⃣ Update role basic info
  await prisma.role.update({
    where: { id: roleId },
    data: { name, description },
  });

  // 2️⃣ Remove all old permissions
  await prisma.rolePermission.deleteMany({
    where: { roleId },
  });

  // 3️⃣ Assign new permissions
  const rolePermissions = permissionIds.map((pid) => ({
    roleId,
    permissionId: pid,
  }));

  if (rolePermissions.length > 0) {
    await prisma.rolePermission.createMany({
      data: rolePermissions,
      skipDuplicates: true,
    });
  }

  // 4️⃣ Return updated role with permissions
  return getRoleById(roleId, { includePermissions: true });
};
/**
 * Delete role by ID
 * @param {string} id
 * @returns {Promise<{message: string}>}
 */
const deleteRole = async (id) => {
  await getRoleById(id);

  // Check if the role is assigned to any users
  const usersWithRole = await prisma.user.findMany({
    where: { roleId: id },
  });

  if (usersWithRole.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot delete role assigned to users. Reassign users first.',
    );
  }

  // First delete all role-permission relations
  await prisma.rolePermission.deleteMany({
    where: { roleId: id },
  });

  // Then delete the role
  await prisma.role.delete({
    where: { id },
  });

  return { message: 'Role deleted successfully' };
};

/**
 * Assign permissions to a role
 * @param {string} roleId
 * @param {string[]} permissionIds
 * @returns {Promise<Role>}
 */
const assignPermissions = async (roleId, permissionIds) => {
  await getRoleById(roleId);

  // First remove all existing permissions
  await prisma.rolePermission.deleteMany({
    where: { roleId },
  });

  // Then add the new permissions
  const rolePermissions = permissionIds.map((permissionId) => ({
    roleId,
    permissionId,
  }));

  await prisma.rolePermission.createMany({
    data: rolePermissions,
    skipDuplicates: true,
  });

  return getRoleById(roleId, { includePermissions: true });
};

/**
 * Add a single permission to a role
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<RolePermission>}
 */
const addPermissionToRole = async (roleId, permissionId) => {
  return rolePermissionService.createRolePermission(roleId, permissionId);
};

/**
 * Remove a single permission from a role
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<{message: string}>}
 */
const removePermissionFromRole = async (roleId, permissionId) => {
  return rolePermissionService.deleteRolePermissionByRelation(
    roleId,
    permissionId,
  );
};

module.exports = {
  createRole,
  getRoleById,
  getRoleByName,
  getAllRoles,
  updateRole,
  deleteRole,
  assignPermissions,
  addPermissionToRole,
  removePermissionFromRole,
  updateRoleWithPermissions,
};
