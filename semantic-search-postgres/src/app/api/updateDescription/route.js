import { NextResponse } from "next/server";
import { query } from '../../../utils/db';
import logger from '../../logger';
import worker_id from '../../workerIdSingleton'

async function handler(req) {
  const { sku, description } = await req.json();

  logger.info({
    message: "Products update handler hit",
    service: "emu",
    sku,
    description,
    worker_id,
    action: "products_update_handler",
  });

  try {
    await query(`
      UPDATE products_with_increment
      SET description = $1
      WHERE sku = $2
    `, [description, sku]);

  } catch (e) {
    logger.error({
      message: "Error updating product",
      service: "emu",
      sku,
      e,
      worker_id,
      action: "error_updating_product",
    });
  }

  // Log the query statement for debugging
  logger.info({
    message: `Formed update products query`,
    query: `SELECT * FROM products_with_increment WHERE sku = '${sku}' limit 1`,
    service: "emu",
    sku,
    worker_id,
    action: "update_products_query",
  });


  // Get updated product
  const updatedProduct = await query(`
    SELECT * FROM products_with_increment WHERE sku = $1 limit 1
  `, [sku]);

  console.log(updatedProduct.rows);

  logger.info({
    message: `Received updated products rows`,
    rows: updatedProduct.rows,
    service: "emu",
    sku,
    worker_id,
    action: "update_products_rows",
  });

  return NextResponse.json(updatedProduct.rows[0]);
}

export {
  handler as POST
}
