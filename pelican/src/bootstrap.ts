import { query } from "./dbClient";

export const isBootstrappingComplete = async (): Promise<boolean> => {
  const result = await query("SELECT is_complete FROM bootstrapping_state");
  return result.rows[0].is_complete;
};
