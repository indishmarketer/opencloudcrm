import { pool } from "@/lib/db";

export type DirectMessage = {
  id: number;
  sender_id: number;
  receiver_id: number;
  body: string;
  read_at: string | null;
  created_at: string;
  sender_username: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  receiver_username: string | null;
  receiver_name: string | null;
  receiver_avatar: string | null;
};

export type ChatSummary = {
  other_user_id: number;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  last_message_body: string;
  last_message_at: string;
  unread_count: number;
};

export async function listChats(userId: number): Promise<ChatSummary[]> {
  const result = await pool.query(
    `WITH latest_msgs AS (
       SELECT 
         CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id,
         MAX(created_at) as max_created_at
       FROM direct_messages
       WHERE sender_id = $1 OR receiver_id = $1
       GROUP BY 1
     )
     SELECT 
       lm.other_user_id,
       u.username,
       u.name,
       u.avatar_url,
       m.body AS last_message_body,
       m.created_at AS last_message_at,
       COALESCE(unread.count, 0)::int AS unread_count
     FROM latest_msgs lm
     JOIN users u ON u.id = lm.other_user_id
     JOIN direct_messages m ON m.created_at = lm.max_created_at 
          AND (m.sender_id = lm.other_user_id OR m.receiver_id = lm.other_user_id)
          AND (m.sender_id = $1 OR m.receiver_id = $1)
     LEFT JOIN (
       SELECT sender_id, COUNT(*) as count 
       FROM direct_messages 
       WHERE receiver_id = $1 AND read_at IS NULL 
       GROUP BY sender_id
     ) unread ON unread.sender_id = lm.other_user_id
     ORDER BY m.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getMessages(userId: number, otherUserId: number): Promise<DirectMessage[]> {
  const result = await pool.query(
    `SELECT 
       m.*, 
       s.username AS sender_username, s.name AS sender_name, s.avatar_url AS sender_avatar,
       r.username AS receiver_username, r.name AS receiver_name, r.avatar_url AS receiver_avatar
     FROM direct_messages m
     JOIN users s ON s.id = m.sender_id
     JOIN users r ON r.id = m.receiver_id
     WHERE (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
     ORDER BY m.created_at ASC`,
    [userId, otherUserId]
  );
  return result.rows;
}

export async function sendMessage(senderId: number, receiverId: number, body: string): Promise<DirectMessage> {
  await pool.query(
    `INSERT INTO direct_messages (sender_id, receiver_id, body)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [senderId, receiverId, body]
  );
  
  // Return the full message type by querying it back
  const msgs = await getMessages(senderId, receiverId);
  return msgs[msgs.length - 1];
}

export async function markAsRead(userId: number, senderId: number): Promise<void> {
  await pool.query(
    `UPDATE direct_messages 
     SET read_at = now() 
     WHERE receiver_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [userId, senderId]
  );
}

export async function getUnreadCount(userId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int as count FROM direct_messages WHERE receiver_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return result.rows[0].count;
}
