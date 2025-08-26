const { ApolloServer, gql } = require('apollo-server-express');
const express = require('express');

// In-memory data store
let warehouses = [
  { id: "BLR-A", name: "Bangalore Warehouse A" },
  { id: "BLR-B", name: "Bangalore Warehouse B" },
  { id: "PNQ-C", name: "Pune Warehouse C" },
  { id: "DEL-B", name: "Delhi Warehouse B" },
  { id: "MUM-A", name: "Mumbai Warehouse A" }
];

let products = [
  { id: "P-1001", name: "12mm Hex Bolt", sku: "HEX-12-100", warehouseId: "BLR-A", stock: 180, demand: 120 },
  { id: "P-1002", name: "Steel Washer", sku: "WSR-08-500", warehouseId: "BLR-A", stock: 50, demand: 80 },
  { id: "P-1003", name: "M8 Nut", sku: "NUT-08-200", warehouseId: "PNQ-C", stock: 80, demand: 80 },
  { id: "P-1004", name: "Bearing 608ZZ", sku: "BRG-608-50", warehouseId: "DEL-B", stock: 24, demand: 120 },
  { id: "P-1005", name: "Steel Rod 10mm", sku: "ROD-10-300", warehouseId: "MUM-A", stock: 200, demand: 150 },
  { id: "P-1006", name: "Aluminum Sheet", sku: "ALU-SHT-200", warehouseId: "BLR-B", stock: 75, demand: 100 }
];

// Helper function to calculate status
const getStatus = (stock, demand) => {
  if (stock > demand) return "healthy";
  if (stock === demand) return "low";
  return "critical";
};

// Helper function to get warehouse by id
const getWarehouseById = (id) => warehouses.find(w => w.id === id);

// GraphQL schema definition
const typeDefs = gql`
  type Warehouse {
    id: ID!
    name: String!
  }

  type Product {
    id: ID!
    name: String!
    sku: String!
    warehouse: Warehouse!
    stock: Int!
    demand: Int!
    status: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type ProductConnection {
    items: [Product!]!
    total: Int!
    pageInfo: PageInfo!
  }

  type KPI {
    date: String!
    stock: Int!
    demand: Int!
  }

  input ProductFilters {
    search: String
    warehouseId: String
    status: String
  }

  input PaginationInput {
    page: Int
    limit: Int
  }

  type Query {
    products(filters: ProductFilters, pagination: PaginationInput): ProductConnection!
    warehouses: [Warehouse!]!
    kpis(range: String!): [KPI!]!
  }

  type Mutation {
    updateDemand(productId: ID!, demand: Int!): Product!
    transferStock(productId: ID!, fromWarehouse: ID!, toWarehouse: ID!, quantity: Int!): Product!
  }
`;

// Resolvers
const resolvers = {
  Query: {
    products: (_, { filters = {}, pagination = {} }) => {
      const { search, warehouseId, status } = filters;
      const { page = 0, limit = 100 } = pagination;

      let filtered = products.map(product => ({
        ...product,
        warehouse: getWarehouseById(product.warehouseId),
        status: getStatus(product.stock, product.demand)
      }));

      // Apply filters
      if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(searchLower) || 
          p.sku.toLowerCase().includes(searchLower)
        );
      }

      if (warehouseId) {
        filtered = filtered.filter(p => p.warehouseId === warehouseId);
      }

      if (status) {
        filtered = filtered.filter(p => p.status === status);
      }

      console.log('stat', status, filtered);

      const total = filtered.length;
      const items = filtered.slice(page, page + limit);

      return {
        items,
        total,
        pageInfo: {
          hasNextPage: page + limit < total,
          hasPreviousPage: page > 0
        }
      };
    },

    warehouses: () => {
      return warehouses;
    },

    kpis: (_, { range }) => {
      const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
      const kpis = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        // Generate mock data with some variation
        const baseStock = 300 + Math.floor(Math.random() * 100);
        const baseDemand = 250 + Math.floor(Math.random() * 80);
        
        kpis.push({
          date: date.toISOString().split('T')[0],
          stock: baseStock,
          demand: baseDemand
        });
      }
      
      return kpis;
    }
  },

  Mutation: {
    updateDemand: (_, { productId, demand }) => {
      const productIndex = products.findIndex(p => p.id === productId);
      if (productIndex === -1) {
        throw new Error(`Product with id ${productId} not found`);
      }

      products[productIndex].demand = demand;
      const product = {
        ...products[productIndex],
        warehouse: getWarehouseById(products[productIndex].warehouseId),
        status: getStatus(products[productIndex].stock, demand)
      };

      return product;
    },

    transferStock: (_, { productId, fromWarehouse, toWarehouse, quantity }) => {
      const productIndex = products.findIndex(p => p.id === productId);
      if (productIndex === -1) {
        throw new Error(`Product with id ${productId} not found`);
      }

      const product = products[productIndex];
      
      // Validate fromWarehouse matches current warehouse
      if (product.warehouseId !== fromWarehouse) {
        throw new Error(`Product is not currently in warehouse ${fromWarehouse}`);
      }

      // Validate toWarehouse exists
      if (!getWarehouseById(toWarehouse)) {
        throw new Error(`Warehouse ${toWarehouse} not found`);
      }

      // Validate quantity doesn't exceed current stock
      if (quantity > product.stock) {
        throw new Error(`Cannot transfer ${quantity} items. Only ${product.stock} available in stock`);
      }

      // Update warehouse and stock
      products[productIndex].warehouseId = toWarehouse;
      products[productIndex].stock = quantity;

      const updatedProduct = {
        ...products[productIndex],
        warehouse: getWarehouseById(toWarehouse),
        status: getStatus(quantity, product.demand)
      };

      return updatedProduct;
    }
  }
};

async function startServer() {
  const app = express();
  
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    playground: true,
    formatError: (err) => {
      // Log the error for debugging
      console.error('GraphQL Error:', err);
      
      // Return formatted error without exposing internal details
      return {
        message: err.message,
        locations: err.locations,
        path: err.path,
        extensions: {
          code: err.extensions?.code,
          exception: process.env.NODE_ENV === 'development' ? err.extensions?.exception : undefined
        }
      };
    },
    plugins: [
      {
        requestDidStart() {
          return {
            willSendResponse(requestContext) {
              // Ensure GraphQL errors return 200 status code
              if (requestContext.response.http && requestContext.errors) {
                requestContext.response.http.status = 200;
              }
            }
          };
        }
      }
    ]
  });

  await server.start();
  server.applyMiddleware({ 
    app, 
    path: '/graphql',
    cors: {
      origin: true,
      credentials: true
    }
  });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 GraphQL Server running at http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`📊 GraphQL Playground available at http://localhost:${PORT}${server.graphqlPath}`);
  });
}

startServer().catch(error => {
  console.error('Error starting server:', error);
});