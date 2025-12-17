export interface User {
  id: number;
  username: string;
  password: string;
  role?: 'student' | 'teacher';
}

export interface Task {
  id: string;
  userId: number;
  title: string;
  subject: string;
  completed: boolean;
  finishDate: number;
  createdAt: number;
  updatedAt: number;
}

export type Notification = {
  id: string;
  type: string;
  taskId: string;
  message: string;
  name: string;
  subject: string;
  ts: number;
};
