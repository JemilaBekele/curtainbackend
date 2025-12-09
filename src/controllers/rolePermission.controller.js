const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { rolePermissionService } = require('../services');

// Create Role-Permission relationship
const createRolePermission = catchAsync(async (req, res) => {
  const rolePermission = await rolePermissionService.createRolePermission({
    roleId: req.body.roleId,
    permissionIds: req.body.permissionIds,
  });
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Role-Permission relationship created successfully',
    rolePermission,
  });
});
const assignRolePermissions = catchAsync(async (req, res) => {
  const rolePermission = await rolePermissionService.assignRolePermissions({
    roleId: req.body.roleId,
    permissionIds: req.body.permissionIds,
  });
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Role-Permission relationship created successfully',
    rolePermission,
  });
});
const updateRolePermissions = catchAsync(async (req, res) => {
  const { roleId, permissionIds } = req.body;

  const result = await rolePermissionService.updateAssignedRolePermissions({
    roleId,
    permissionIds,
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Role permissions updated successfully',
    ...result,
  });
});
// Get Role-Permission by ID
const getRolePermissionById = catchAsync(async (req, res) => {
  const rolePermission = await rolePermissionService.getRolePermissionById(
    req.params.id,
  );
  res.status(httpStatus.OK).send(rolePermission);
});

// Get all Role-Permission relationships
const getAllRolePermissions = catchAsync(async (req, res) => {
  const { sortBy, sortOrder } = req.query;
  const { rolePermissions, count } =
    await rolePermissionService.getAllRolePermissions(
      {},
      {
        sortBy,
        sortOrder,
      },
    );
  res.status(httpStatus.OK).send({ rolePermissions, count });
});

// Delete Role-Permission by ID
const deleteRolePermission = catchAsync(async (req, res) => {
  await rolePermissionService.deleteRolePermission(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Role-Permission relationship deleted successfully',
  });
});

// Delete Role-Permission by relation
const deleteRolePermissionByRelation = catchAsync(async (req, res) => {
  await rolePermissionService.deleteRolePermissionByRelation(
    req.params.roleId,
    req.params.permissionId,
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Role-Permission relationship deleted successfully',
  });
});

module.exports = {
  updateRolePermissions,
  createRolePermission,
  getRolePermissionById,
  getAllRolePermissions,
  deleteRolePermission,
  deleteRolePermissionByRelation,
  assignRolePermissions,
};
