FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json before copying rest of the code
COPY package*.json ./

# Install node modules
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]