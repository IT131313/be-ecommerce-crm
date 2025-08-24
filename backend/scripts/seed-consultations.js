const db = require('../config/database');

async function seedConsultationData() {
  try {
    // Insert consultation types
    await db.run(`
      INSERT INTO consultation_types (name, description)
      VALUES ('Konsultasi Online', 'Konsultasi melalui video call atau chat online')
    `);

    await db.run(`
      INSERT INTO consultation_types (name, description)
      VALUES ('Kunjungan Langsung ke Rumah Anda', 'Tim desainer akan datang langsung ke lokasi Anda')
    `);

    await db.run(`
      INSERT INTO consultation_types (name, description)
      VALUES ('Konsultasi Langsung di CV. Ariftama Tekindo', 'Konsultasi di kantor CV. Ariftama Tekindo')
    `);

    // Insert design categories
    await db.run(`
      INSERT INTO design_categories (name, image_url)
      VALUES ('Set Dapur', '/images/kitchen-design.jpg')
    `);

    await db.run(`
      INSERT INTO design_categories (name, image_url)
      VALUES ('Kantor', '/images/office-design.jpg')
    `);

    await db.run(`
      INSERT INTO design_categories (name, image_url)
      VALUES ('Kamar Tidur', '/images/bedroom-design.jpg')
    `);

    await db.run(`
      INSERT INTO design_categories (name, image_url)
      VALUES ('Rumah', '/images/house-design.jpg')
    `);

    // Insert design styles
    await db.run(`
      INSERT INTO design_styles (name, image_url)
      VALUES ('Modern Kontemporer', '/images/modern-contemporary.jpg')
    `);

    await db.run(`
      INSERT INTO design_styles (name, image_url)
      VALUES ('Modern Klasik', '/images/modern-classic.jpg')
    `);

    await db.run(`
      INSERT INTO design_styles (name, image_url)
      VALUES ('Minimalis', '/images/minimalist.jpg')
    `);

    await db.run(`
      INSERT INTO design_styles (name, image_url)
      VALUES ('Industrial', '/images/industrial.jpg')
    `);

    console.log('Consultation data seeded successfully');
  } catch (error) {
    console.error('Error seeding consultation data:', error);
  }
}

// Run the seed function
seedConsultationData();