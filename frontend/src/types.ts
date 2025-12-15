export interface User {
  id: number;
  username: string;
  password: string;
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
  ts: number;
};
