import mongoose from 'mongoose';
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

class MongooseService {
  private count = 0;
  private mongooseOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000  };

  constructor() {
      this.connectWithRetry();
  }

  getMongoose() {
      return mongoose;
  }

  connectWithRetry = () => {
      console.log(process.env.MONGO_DB);
      
      console.log('Attempting MongoDB connection (will retry if needed)');
      mongoose
          .connect(process.env.MONGO_DB as string, this.mongooseOptions)
          .then(() => {
              console.log('MongoDB is connected');
          })
          .catch((err) => {
              const retrySeconds = 5;
              console.log(
                  `MongoDB connection unsuccessful (will retry #${++this
                      .count} after ${retrySeconds} seconds):`,
                  err
              );
              setTimeout(this.connectWithRetry, retrySeconds * 1000);
          });
  };
}
export default new MongooseService();