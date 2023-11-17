import { NextResponse } from "next/server";
import { query } from '@/utils/db';

async function handler(req) {
  const { sku, description } = await req.json();
  console.log(sku, description);
  try {
    await query(`
      UPDATE products_with_increment
      SET description = $1
      WHERE sku = $2
    `, [description, sku]);

  } catch (e) {
    console.log(`Failed updating product ${sku}: ${e}`);
  }

  // Log the query statement for debugging
  console.log(`SELECT * FROM products_with_increment WHERE sku = '${sku}' limit 1`);

  // Get updated product
  const updatedProduct = await query(`
    SELECT * FROM products_with_increment WHERE sku = $1 limit 1
  `, [sku]);

  console.log(updatedProduct.rows);

  return NextResponse.json(updatedProduct.rows[0]);
}

export {
  handler as POST
}
