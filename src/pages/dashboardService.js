import { getDatabase, ref, update, increment } from '@firebase/database';

/**
 * Updates the dashboard statistics after a payment is successfully processed.
 * This ensures "Gigs completed" and "Total Earned" are updated atomically.
 * 
 * @param {string} workerId - The UID of the worker who completed the gig.
 * @param {string} gigId - The ID of the gig.
 * @param {number} amountPaid - The total amount earned from this gig.
 */
export const updateDashboardAfterPayment = async (workerId, gigId, amountPaid) => {
  const db = getDatabase();
  const updates = {};
  
  // 1. Mark the gig as 'completed' (which moves it to the 'done' section)
  updates[`gigs/${gigId}/status`] = 'completed';
  updates[`gigs/${gigId}/isPaid`] = true;
  updates[`gigs/${gigId}/completedAt`] = Date.now();

  // 2. Increment worker stats using atomic increment to prevent data races
  // Ensure amountPaid is treated as a number to avoid potential data type issues
  const numericAmount = Number(amountPaid) || 0;
  updates[`users/${workerId}/stats/gigsCompleted`] = increment(1);
  updates[`users/${workerId}/stats/totalEarned`] = increment(numericAmount);

  // 3. Update the global path for dashboard listeners
  return update(ref(db), updates);
};

/**
 * Initializes trust score and ratings to 0 for a new user.
 * Call this during the user registration or profile creation process.
 */
export const initializeUserMetrics = (userId) => {
  const db = getDatabase();
  return update(ref(db, `users/${userId}`), {
    trustScore: 0,
    rating: 0,
    stats: {
      gigsCompleted: 0,
      totalEarned: 0
    }
  });
};