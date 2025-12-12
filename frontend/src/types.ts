export interface User {
    id: number;
    username: string;
    password: string;
}

export interface Task {
    id: number;
    userId: number;
    title: string;
    subject: string;
    completed: boolean;
    finishDate: number;
}
