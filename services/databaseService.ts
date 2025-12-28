
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  updateDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  setDoc,
  FirestoreError
} from "firebase/firestore";
import { FIREBASE_CONFIG } from "../constants";
import { FeedbackData } from "../types";

// Initialize Firebase only if the API key has been provided
const isConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "REPLACE_WITH_YOUR_KEY";
const app = isConfigured ? initializeApp(FIREBASE_CONFIG) : null;
export const db = app ? getFirestore(app) : null;

const FEEDBACK_COLLECTION = "feedback";

/**
 * Creates a new feedback document in Firestore and returns its ID.
 */
export const createFeedbackSession = async (initialData: FeedbackData): Promise<string> => {
  if (!db) throw new Error("Firebase not configured");
  try {
    await setDoc(doc(db, FEEDBACK_COLLECTION, initialData.id), {
      ...initialData,
      isSynced: true
    });
    return initialData.id;
  } catch (error) {
    console.error("Error creating session in Firestore:", error);
    throw error;
  }
};

/**
 * Updates an existing feedback document.
 */
export const updateFeedbackSession = async (id: string, updates: Partial<FeedbackData>) => {
  if (!db) return;
  try {
    const feedbackRef = doc(db, FEEDBACK_COLLECTION, id);
    await updateDoc(feedbackRef, {
      ...updates,
      isSynced: true
    });
  } catch (error) {
    console.error("Error updating session in Firestore:", error);
  }
};

/**
 * Listens for real-time updates for all feedback records.
 * Includes an error callback to handle permission denied issues.
 */
export const listenToAllFeedback = (
  callback: (data: FeedbackData[]) => void,
  onError?: (error: FirestoreError) => void
) => {
  if (!db) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, FEEDBACK_COLLECTION), orderBy("timestamp", "desc"));
  return onSnapshot(
    q, 
    (snapshot) => {
      const feedbackList = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as FeedbackData[];
      callback(feedbackList);
    },
    (error) => {
      console.error("Firestore Listen Error:", error);
      if (onError) onError(error);
    }
  );
};
