import { getFirebaseApp, loadFirebaseModule } from './firebase.js';
import { SAMPLE_MENU } from '../data/menu.sample.js';

async function importMenu() {
  try {
    const app = await getFirebaseApp();

    if (!app) {
      console.error("Firebase isn't configured.");
      return;
    }

    const {
      getFirestore,
      doc,
      setDoc,
      serverTimestamp
    } = await loadFirebaseModule('firestore');

    const db = getFirestore(app);

    for (const item of SAMPLE_MENU) {

      const { id, ...data } = item;

      await setDoc(
        doc(db, "menuItems", id),
        {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      console.log("Imported:", id);
    }

    console.log("=================================");
    console.log("Menu import completed successfully.");
    console.log("=================================");

  } catch (err) {
    console.error(err);
  }
}

importMenu();