import { useState } from "react";
import { DATABASE_URL, FetchDatabase } from "../App";


export function Task({ id, text, subject, completed, date, setTasks }: { id: string, text: string, subject: string, completed: boolean, date: number, setTasks: any }) {
    const [completedState, setCompleted] = useState(completed);

    return (
        <li>
            <input type='checkbox' checked={completedState} onChange={(e) => { handleCheck(e.target.checked, text, setCompleted, setTasks, id) }}></input>
            <p>{"Datum odevzdání: " + new Date(date).toISOString().split('T')[0]}</p>
            <p className={completedState ? 'checked' : ''}>{"Popis: " + text + " | " + "Předmět: " + subject}</p>
            <button onClick={() => HandleDelete(id, setTasks)}>Remove</button>
        </li>
    )
}

function handleCheck(checked: boolean, text: string, setCompleted: any, setTasks: any, id: string) {
    setCompleted(checked);

    fetch(DATABASE_URL + '/tasks/' + id, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: text, completed: checked })
    });

    FetchDatabase(setTasks);
}

function HandleDelete(id: string, setTasks: any) {
    fetch(DATABASE_URL + '/tasks/' + id, {
        method: 'DELETE',
    })

    FetchDatabase(setTasks);
}