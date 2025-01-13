import dotenv from 'dotenv';
dotenv.config();
import express from 'express'
import cors from 'cors';
import { MongoDB } from './mongoose';
import router from './routes';
import cron from 'node-cron';
import { User } from './mongoose/models/User';
const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

// Initialize MongoDB connection
const mongodb = new MongoDB(process.env.MONGODB_URI || '');

// Connect to MongoDB before starting the server
const startServer = async () => {
  try {
    await mongodb.connect();
    
    // Run every hour
    cron.schedule('0 * * * *', async () => {
      const users = await User.find({});
      for (const user of users) {
        await user.update24HourRewards();
      }
    });
    
    app.listen(Number(process.env.PORT), '::', () => {
      console.log(`Server is running on port ${process.env.PORT} (IPv4 & IPv6)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
