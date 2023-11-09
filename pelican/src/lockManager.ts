import { query } from './dbClient';

async function checkInitializationStatus(): Promise<boolean> {
  try {
    const result = await query(
      'SELECT initialized FROM locks WHERE lock_name = $1',
      ['pelican-init-lock']
    );

    if (result.rows.length > 0 && result.rows[0].initialized === true) {
      return true; // Initialization has already been completed
    }

    return false; // Initialization is needed
  } catch (error) {
    console.error('Error checking initialization status:', error);
    return false;
  }
}

async function setInitializationStatus(initialized: boolean): Promise<void> {
  try {
    await query(
      'UPDATE locks SET initialized = $1 WHERE lock_name = $2',
      [initialized, 'pelican-init-lock']
    );
  } catch (error) {
    console.error('Error setting initialization status:', error);
  }
}

export { checkInitializationStatus, setInitializationStatus };
