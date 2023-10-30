import { useState, useEffect, ChangeEvent, FunctionComponent } from 'react';

type DebouncedInputProps = {
    value: string;
    onChange: (value: string) => void;
    delay?: number;
};

const DebouncedInput: FunctionComponent<DebouncedInputProps> = ({ value, onChange, delay = 600 }) => {
    const [innerValue, setInnerValue] = useState(value);

    useEffect(() => {
        const timerId = setTimeout(() => {
            onChange(innerValue);
        }, delay);

        return () => {
            clearTimeout(timerId);
        };
    }, [innerValue, delay, onChange]);

    return (
        <input
            type="text"
            value={innerValue}
            className="w-full p-2 mb-4 border rounded text-black"
            placeholder="Search..."
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInnerValue(e.target.value)}
        />
    );
};

export default DebouncedInput;