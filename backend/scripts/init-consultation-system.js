const db = require('../config/database');

async function initConsultationSystem() {
  try {
    console.log('Initializing consultation system...');

    // Clear existing consultation data
    await db.run('DELETE FROM consultations');
    await db.run('DELETE FROM consultation_types');
    await db.run('DELETE FROM design_categories');
    await db.run('DELETE FROM design_styles');

    console.log('Seeding consultation types...');
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

    console.log('Seeding design categories...');
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

    console.log('Seeding design styles...');
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

    await db.run(`
      INSERT INTO design_styles (name, image_url)
      VALUES ('Skandinavia', '/images/scandinavian.jpg')
    `);

    await db.run(`
      INSERT INTO design_styles (name, image_url)
      VALUES ('Rustic', '/images/rustic.jpg')
    `);

    console.log('Consultation system initialized successfully!');
    
    // Display summary
    const typesCount = await db.get('SELECT COUNT(*) as count FROM consultation_types');
    const categoriesCount = await db.get('SELECT COUNT(*) as count FROM design_categories');
    const stylesCount = await db.get('SELECT COUNT(*) as count FROM design_styles');
    
    console.log(`\nSummary:`);
    console.log(`- Consultation types: ${typesCount.count}`);
    console.log(`- Design categories: ${categoriesCount.count}`);
    console.log(`- Design styles: ${stylesCount.count}`);
    
  } catch (error) {
    console.error('Error initializing consultation system:', error);
    throw error;
  }
}

// Run the initialization
if (require.main === module) {
  initConsultationSystem()
    .then(() => {
      console.log('Consultation system setup completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to initialize consultation system:', error);
      process.exit(1);
    });
}

module.exports = initConsultationSystem;