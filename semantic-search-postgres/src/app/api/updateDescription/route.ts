import { NextRequest, NextResponse } from "next/server";
import db from '@/utils/db';

async function handler(req: NextRequest) {
    const { sku, description } = await req.json();
    console.log(sku, description)
    const pgClient = await db.getClient()
    try {
        await pgClient.query(`
        UPDATE products_with_increment
        SET description = '${description}'
        WHERE sku = '${sku}'
    `)
    } catch (e) {
        console.log(`Failed updating product ${sku}: ${e}`)
    }
    console.log(`SELECT * FROM products_with_increment
    WHERE sku = '${sku}' limit 1`)
    //get updated product

    const updatedProduct = await pgClient.query(`SELECT * FROM products_with_increment WHERE sku = '${sku}' limit 1`)

    console.log(updatedProduct.rows)

    return NextResponse.json(updatedProduct.rows[0]);
}

export {
    handler as POST
}
