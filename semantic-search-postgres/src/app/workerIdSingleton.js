import { v4 as uuidv4 } from "uuid";
// Use the ECS_TASK_ID, if we're running in fargate - otherwise default to a UUID
// for unique ID simulation in development
const worker_id = process.env.ECS_TASK_ID ?? uuidv4();

export default worker_id;
