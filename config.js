window.AGRIPAL_API_BASE =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080'
    : 'https://agri-bot-b.onrender.com';
