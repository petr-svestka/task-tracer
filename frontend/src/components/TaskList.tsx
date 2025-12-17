import { Task as TaskType } from '../types';
import { Task } from "./Task"
import './TaskList.css';
import { getAuthUser } from '../auth';

function TaskList({ tasks, setTasks }: { tasks: TaskType[], setTasks: React.Dispatch<React.SetStateAction<TaskType[]>> }) {
    const currentUser = getAuthUser();

    if (currentUser?.role === 'teacher') {
        const yourTasks = tasks.filter((t) => t.userId === currentUser.id);
        const otherTasks = tasks.filter((t) => t.userId !== currentUser.id);

        return (
            <div className="task-list-container">
                <h3>Your Tasks</h3>
                <ul className="task-list">
                    {yourTasks.map((task) => (
                        <Task key={task.id} task={task} setTasks={setTasks} />
                    ))}
                </ul>

                <h3>Other Tasks</h3>
                <ul className="task-list">
                    {otherTasks.map((task) => (
                        <Task key={task.id} task={task} setTasks={setTasks} />
                    ))}
                </ul>
            </div>
        );
    }

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