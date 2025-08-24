const db = require('../config/database');

async function seedProducts() {
  try {
    // Insert lighting products
    await db.run(`
      INSERT INTO products (name, description, category, price, image_url)
      VALUES (
        'Philips LED Emergency',
        'Lampu LED emergency hemat energi dengan baterai cadangan',
        'lighting',
        35000,
        '/images/products/led-emergency.jpg'
      )
    `);

    await db.run(`
      INSERT INTO products (name, description, category, price, image_url)
      VALUES (
        'Philips Strip Lamp',
        'Lampu strip LED fleksibel untuk dekorasi dan pencahayaan ambient',
        'lighting',
        500000,
        '/images/products/strip-lamp.jpg'
      )
    `);

    await db.run(`
      INSERT INTO products (name, description, category, price, image_url)
      VALUES (
        'Philips Pendant Light',
        'Lampu gantung modern dengan desain elegan',
        'lighting',
        1000000,
        '/images/products/pendant-light.jpg'
      )
    `);

    // Insert furniture products
    await db.run(`
      INSERT INTO products (name, description, category, price, image_url)
      VALUES (
        'Wasteful fish Marmer',
        'Meja marmer premium dengan desain eksklusif',
        'furniture',
        8700000,
        '/images/products/marble-table.jpg'
      )
    `);

    await db.run(`
      INSERT INTO products (name, description, category, price, image_url)
      VALUES (
        'Meja Kayu 44x66x66 cm',
        'Meja kayu solid dengan ukuran 44x66x66 cm',
        'furniture',
        450000,
        '/images/products/wooden-table.jpg'
      )
    `);

    console.log('Products seeded successfully');
  } catch (error) {
    console.error('Error seeding products:', error);
  }
}

// Run the seed function
seedProducts();