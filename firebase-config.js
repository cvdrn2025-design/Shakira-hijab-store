// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyDYMBEoBf3NqFJfni8XcFif1HeKIMugRm0",
  authDomain: "shakira-hijabstore.firebaseapp.com",
  projectId: "shakira-hijabstore",
  storageBucket: "shakira-hijabstore.firebasestorage.app",
  messagingSenderId: "628358191731",
  appId: "1:628358191731:web:9e0334e23b566926062806"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);

// Export global
const db = firebase.firestore();
const productsCollection = db.collection('products');
