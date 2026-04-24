const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Get Category by ID
const getCategoryById = async (id) => {
  const category = await prisma.category.findUnique({
    where: { id },
  });
  return category;
};

// Get Category by Name
const getCategoryByName = async (name) => {
  const category = await prisma.category.findFirst({
    where: { name },
  });
  return category;
};

// Get all Categories
const getAllCategories = async () => {
  const categories = await prisma.category.findMany({
    orderBy: {
      name: 'asc',
    },
  });

  return {
    categories,
    count: categories.length,
  };
};

// Create Category
const createCategory = async (categoryBody) => {
  // Check if category with same name already exists
  if (await getCategoryByName(categoryBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category name already taken');
  }

  const category = await prisma.category.create({
    data: categoryBody,
  });
  return category;
};

// Update Category
const updateCategory = async (id, updateBody) => {
  const existingCategory = await getCategoryById(id);
  if (!existingCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  // Check if name is being updated to an existing category name
  if (updateBody.name && updateBody.name !== existingCategory.name) {
    if (await getCategoryByName(updateBody.name)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Category name already taken');
    }
  }

  const updatedCategory = await prisma.category.update({
    where: { id },
    data: updateBody,
    include: {
      products: true,
    },
  });

  return updatedCategory;
};

// Delete Category
const deleteCategory = async (id) => {
  const existingCategory = await getCategoryById(id);
  if (!existingCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  await prisma.category.delete({
    where: { id },
  });

  return { message: 'Category deleted successfully' };
};
const getColourById = async (id) => {
  const colour = await prisma.colour.findUnique({
    where: { id },
    include: {
      products: true,
    },
  });

  if (!colour) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Colour not found');
  }

  return colour;
};

// Get Colour by Name
const getColourByName = async (name) => {
  const colour = await prisma.colour.findFirst({
    where: {
      name: {
        equals: name,
      },
    },
  });
  return colour;
};

// Get all Colours with pagination and filtering
const getAllColours = async (filter, options) => {
  const { name } = filter || {};
  const { sortBy, order, page = 1, limit = 10 } = options || {};

  // Build where clause
  const where = {};
  if (name) {
    where.name = {
      contains: name,
      mode: 'insensitive',
    };
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get total count
  const total = await prisma.colour.count({ where });

  // Get colours with pagination
  const colours = await prisma.colour.findMany({
    where,
    orderBy: sortBy ? { [sortBy]: order || 'asc' } : { name: 'asc' },
    skip,
    take: limit,
    include: {
      products: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const totalPages = Math.ceil(total / limit);

  return {
    colours,
    count: colours.length,
    total,
    page,
    totalPages,
    limit,
  };
};

// Create Colour
const createColour = async (colourBody) => {
  // Check if colour with same name already exists (case-insensitive)
  const existingColour = await getColourByName(colourBody.name);
  if (existingColour) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Colour name already exists');
  }

  const colour = await prisma.colour.create({
    data: colourBody,
  });

  return colour;
};

// Update Colour
const updateColour = async (id, updateBody) => {
  const existingColour = await getColourById(id);

  // Check if name is being updated to an existing colour name
  if (updateBody.name && updateBody.name !== existingColour.name) {
    const colourWithSameName = await getColourByName(updateBody.name);
    if (colourWithSameName) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Colour name already exists');
    }
  }

  const updatedColour = await prisma.colour.update({
    where: { id },
    data: updateBody,
    include: {
      products: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return updatedColour;
};

// Delete Colour
const deleteColour = async (id) => {
  const existingColour = await getColourById(id);

  // Check if colour has associated products
  if (existingColour.products && existingColour.products.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot delete colour with associated products. Remove products first.',
    );
  }

  await prisma.colour.delete({
    where: { id },
  });

  return {
    message: 'Colour deleted successfully',
    deletedColour: existingColour.name,
  };
};

module.exports = {
  getCategoryById,
  getCategoryByName,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getColourById,
  getColourByName,
  getAllColours,
  createColour,
  updateColour,
  deleteColour,
};
