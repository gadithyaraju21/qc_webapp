# Use an official Node.js runtime as the base image
FROM node:14

# Set the working directory in the container
WORKDIR /usr/src/app/qc_webapp

# Copy package.json and package-lock.json
COPY qc_webapp/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY qc_webapp .

# List contents of the app directory (for debugging)
RUN ls -la

# Expose the port the app runs on
EXPOSE 2015

# Command to run the application
CMD ["node", "app.js"]