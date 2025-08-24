const db = require('../config/database');

async function seedServices() {
  try {
    // Insert construction service
    await db.run(`
      INSERT INTO services (name, description, category, image_url)
      VALUES (
        'Konstruksi Profesional',
        'Layanan konstruksi profesional untuk berbagai kebutuhan bangunan Anda',
        'construction',
        '/images/construction.jpg'
      )
    `);

    // Insert interior design service
    await db.run(`
      INSERT INTO services (name, description, category, image_url)
      VALUES (
        'Designer Interior Profesional',
        'Layanan desain interior profesional untuk mewujudkan ruangan impian Anda',
        'interior',
        '/images/interior.jpg'
      )
    `);

    // Insert electrical service
    await db.run(`
      INSERT INTO services (name, description, category, image_url)
      VALUES (
        'Instalasi Elektrik',
        'Layanan instalasi dan perbaikan elektrik oleh teknisi berpengalaman',
        'electrical',
        '/images/electrical.jpg'
      )
    `);

    console.log('Services seeded successfully');
  } catch (error) {
    console.error('Error seeding services:', error);
  }
}

// Run the seed function
seedServices();