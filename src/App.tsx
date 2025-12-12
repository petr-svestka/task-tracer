import './App.css'
import { useEffect, useState } from "react";
import TaskList from './components/TaskList'
import CreateTask from './components/CreateTask'

export interface ITask {
  id: string,
  title: string,
  subject: string,
  completed: boolean,
  finishDate: number
}

export const DATABASE_URL: string = 'http://localhost:3000';

function App() {
  const [tasks, setTasks] = useState<ITask[]>([]);

  useEffect(() => {
    FetchDatabase(setTasks);
  }, []);

  return (
    <>
      <h1>Todo List</h1>

      <CreateTask setTasks={setTasks} />

      <TaskList tasks={tasks} setTasks={setTasks} />
    </>
  )
}

export function FetchDatabase(setTasks: any) {
  fetch(DATABASE_URL + '/tasks?_sort=-completed,finishDate', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => response.json())
    .then((tasks: ITask[]) => setTasks(tasks));
}

export default App
