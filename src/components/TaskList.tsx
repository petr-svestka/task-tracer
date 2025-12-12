import { Task as TaskType } from '../types';
import { Task } from "./Task"
import './TaskList.css';

function TaskList({ tasks, setTasks }: { tasks: TaskType[], setTasks: React.Dispatch<React.SetStateAction<TaskType[]>> }) {

    return (
        <div className="task-list-container">
            <h3>Your Tasks</h3>
            <ul className="task-list">
                {tasks.map((task) => (
                    <Task key={task.id} task={task} setTasks={setTasks} />
                ))}
            </ul>
        </div>
    )
}

export default TaskList