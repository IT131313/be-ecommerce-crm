const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function createAdmin() {
  const email = 'admin@example.com';
  const name = 'System Administrator';
  const password = 'admin123';

  try {
    // Check if admin already exists
    const existingAdmin = await db.get(
      'SELECT id FROM admins WHERE email = ?',
      [email]
    );
    
    if (existingAdmin) {
      console.log('Admin already exists!');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin
    await db.run(
      'INSERT INTO admins (email, password, name, role) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, name, 'admin']
    );
    
    console.log('Admin created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('Please change the password after first login.');
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}

createAdmin();