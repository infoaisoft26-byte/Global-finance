import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { AppNotification, NotificationCategory } from '../types/index.ts';

/**
 * Creates a real notification in the database
 */
export async function createNotification(
  userId: string,
  category: NotificationCategory,
  title: string,
  message: string,
  actionUrl?: string,
  metadata?: Record<string, any>
): Promise<string> {
  const notifRef = doc(collection(db, 'notifications'));
  const notification: AppNotification = {
    id: notifRef.id,
    userId,
    category,
    title,
    message,
    actionUrl,
    isRead: false,
    metadata: metadata || {},
    createdAt: new Date().toISOString()
  };

  await setDoc(notifRef, notification);
  return notifRef.id;
}

/**
 * Creates notifications for all platform administrators (for compliance/requests)
 */
export async function notifyAdmins(
  title: string,
  message: string,
  category: NotificationCategory = 'admin',
  actionUrl?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const usersRef = collection(db, 'users');
    const adminQuery = query(usersRef, where('role', '==', 'admin'));
    const snap = await getDocs(adminQuery);

    const promises = snap.docs.map(docSnap => 
      createNotification(docSnap.id, category, title, message, actionUrl, metadata)
    );

    // Also notify primary admin email if present
    await Promise.all(promises);
  } catch (err) {
    console.warn('Failed to notify admins:', err);
  }
}

/**
 * Fetches notifications for a specific user
 */
export async function getUserNotifications(
  userId: string,
  maxLimit: number = 50
): Promise<AppNotification[]> {
  try {
    const notifRef = collection(db, 'notifications');
    const q = query(
      notifRef, 
      where('userId', '==', userId), 
      orderBy('createdAt', 'desc'), 
      limit(maxLimit)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as AppNotification);
  } catch (err) {
    console.error('Failed to get notifications:', err);
    return [];
  }
}

/**
 * Gets real unread count directly from database
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    const notifRef = collection(db, 'notifications');
    const q = query(
      notifRef, 
      where('userId', '==', userId), 
      where('isRead', '==', false),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch (err) {
    console.warn('Failed to get unread notification count:', err);
    return 0;
  }
}

/**
 * Marks a single notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const ref = doc(db, 'notifications', notificationId);
  await updateDoc(ref, {
    isRead: true,
    readAt: new Date().toISOString()
  });
}

/**
 * Marks all notifications for a user as read
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const notifRef = collection(db, 'notifications');
  const q = query(notifRef, where('userId', '==', userId), where('isRead', '==', false));
  const snap = await getDocs(q);

  if (snap.empty) return;

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  snap.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      isRead: true,
      readAt: now
    });
  });

  await batch.commit();
}
