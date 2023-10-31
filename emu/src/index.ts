import express, { Express } from 'express';
import router from './router';

const app: Express = express();
const port: string | number = process.env.PORT || 4000;

app.use('/', router);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});