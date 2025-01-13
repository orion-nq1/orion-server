import mongoose from 'mongoose';

export class MongoDB {
  private uri: string;
  private options: mongoose.ConnectOptions;

  constructor(uri: string, options: mongoose.ConnectOptions = {}) {
    this.uri = uri;
    this.options = {
      ...options,
    };
  }

  public async connect(): Promise<void> {
    try {
      await mongoose.connect(this.uri, this.options);
      console.log('Successfully connected to MongoDB.');
    } catch (error) {
      console.error('Error connecting to MongoDB:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      console.log('Successfully disconnected from MongoDB.');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  public getConnection(): typeof mongoose {
    return mongoose;
  }

  public isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}

// Export a default instance
export default MongoDB;
