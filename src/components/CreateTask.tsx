import { useState } from 'react'
import '../App.css'
import { DATABASE_URL, FetchDatabase } from '../App'

function CreateTask({ setTasks }: { setTasks: any }) {

    const [description, setDescription] = useState<string>("")
    const [date, setDate] = useState<Date>(new Date())
    const [subject, setSubject] = useState<string>("")


    return (
        <div id="create_task">
            <label htmlFor="description">Popis:</label>
            <input type="text" id="description" onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
            <label htmlFor="date">Datum odevzdání:</label>
            <input type='date' id='date' min={new Date(Date.now()).toISOString().split('T')[0]} onInput={(e) => setDate(new Date((e.target as HTMLInputElement).value))}></input>
            <label htmlFor="subject">Předmět:</label>
            <input type="text" id="subject" onInput={(e) => setSubject((e.target as HTMLInputElement).value)} />
            <button onClick={() => HandleCreate(description, setTasks, date, subject)}>Create</button>
        </div>
    )
}

function HandleCreate(description: string, setTasks: any, date: Date, subject: string) {
    if (description == "")
        return;

    if (subject == "")
        return;

    fetch(DATABASE_URL + '/tasks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: description, completed: false, finishDate: date.getTime(), subject: subject })
    })

    FetchDatabase(setTasks);
}

export default CreateTask
