import { pool } from "../pool.js";

export interface SalesRepRow {
  id: number;
  display_name: string;
}

export async function listSalesReps(): Promise<SalesRepRow[]> {
  const { rows } = await pool.query<SalesRepRow>(
    "SELECT id, display_name FROM sales_rep ORDER BY display_name",
  );
  return rows;
}
