import React, { useLayoutEffect, useState, useRef, useEffect } from 'react';
import rough from 'roughjs/bundled/rough.esm';
import io from 'socket.io-client';

const generator = rough.generator();

const WhiteBoard = () => {
  const [elements, setElements] = useState([]);
  const [action, setAction] = useState('none');
  const [tool, setTool] = useState('line');
  const [selectedElement, setSelectedElement] = useState(null);
  const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
  const [currentPath, setCurrentPath] = useState([]);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io('your-socket-server-url');

    socketRef.current.on('whiteboard-action', (data) => {
      handleSocketAction(data);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    const roughCanvas = rough.canvas(canvas);
    elements.forEach(({ roughElement }) => roughCanvas.draw(roughElement));
  }, [elements]);

  const createElement = (x1, y1, x2, y2, type, id) => {
    let roughElement;

    switch (type) {
      case 'line':
        roughElement = generator.line(x1, y1, x2, y2);
        break;
      case 'rectangle':
        roughElement = generator.rectangle(x1, y1, x2 - x1, y2 - y1);
        break;
      case 'circle':
        const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        roughElement = generator.circle(x1, y1, radius);
        break;
      case 'freehand':
        roughElement = generator.path(getFreehandPath(currentPath));
        break;
      default:
        throw new Error(`Invalid elementType: ${type}`);
    }

    return { x1, y1, x2, y2, roughElement, type, id };
  };

  const updatedElement = (x1, y1, x2, y2, type, id) => {
    const updatedElement = createElement(x1, y1, x2, y2, type, id);
    const elementsCopy = [...elements];
    elementsCopy[id] = updatedElement;
    setElements(elementsCopy);

    socketRef.current.emit('whiteboard-action', {
      type: 'update',
      data: updatedElement,
    });
  };

  const getFreehandPath = (points) => {
    if (points.length === 0) {
      return '';
    }
    const path = `M ${points[0].x} ${points[0].y} ${points
      .map((point) => `L ${point.x} ${point.y}`)
      .join(' ')}`;
    return path;
  };
  const getElementAtPosition = (x, y, elements) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const { x1, y1, x2, y2 } = elements[i];
      if (
        x >= Math.min(x1, x2) &&
        x <= Math.max(x1, x2) &&
        y >= Math.min(y1, y2) &&
        y <= Math.max(y1, y2)
      ) {
        return elements[i];
      }
    }
    return null;
  };
  const handleSocketAction = (data) => {
    const { type, data: actionData } = data;

    switch (type) {
      case 'update':
        setElements((prevElements) => [...prevElements, actionData]);
        break;
      default:
        break;
    }
  };

  const handleMouseDown = (event) => {
    const { clientX, clientY } = event;

    if (tool === 'selection') {
      const element = getElementAtPosition(clientX, clientY, elements);
      if (element) {
        setSelectedElement(element);
        setAction('moving');
        setStartPosition({ x: clientX, y: clientY });
      }
    } else if (tool === 'freehand') {
      setCurrentPath([{ x: clientX, y: clientY }]);
      setAction('drawing');
    } else {
      const id = elements.length;
      const newElement = createElement(clientX, clientY, clientX, clientY, tool, id);
      setElements((prevState) => [...prevState, newElement]);
      setAction('drawing');

      socketRef.current.emit('whiteboard-action', {
        type: 'create',
        data: newElement,
      });
    }
  };

  const handleMouseMove = (event) => {
    const { clientX, clientY } = event;

    if (action === 'drawing') {
      if (tool === 'freehand') {
        setCurrentPath([...currentPath, { x: clientX, y: clientY }]);
        const id = elements.length;
        const pathElement = createElement(0, 0, 0, 0, 'freehand', id);
        pathElement.roughElement = generator.path(getFreehandPath([...currentPath, { x: clientX, y: clientY }]));
        const elementsCopy = [...elements];
        elementsCopy[id] = pathElement;
        setElements(elementsCopy);
      } else {
        const index = elements.length - 1;
        const { x1, y1 } = elements[index];
        updatedElement(x1, y1, clientX, clientY, tool, index);
      }
    } else if (action === 'moving' && selectedElement) {
      const { x1, y1, x2, y2, type, id } = selectedElement;
      const offsetX = clientX - startPosition.x;
      const offsetY = clientY - startPosition.y;
      updatedElement(x1 + offsetX, y1 + offsetY, x2 + offsetX, y2 + offsetY, type, id);
      setStartPosition({ x: clientX, y: clientY });
    }
  };

  const handleMouseUp = () => {
    if (tool === 'freehand' && currentPath.length > 1) {
      const id = elements.length;
      const pathElement = createElement(0, 0, 0, 0, 'freehand', id);
      pathElement.roughElement = generator.path(getFreehandPath(currentPath));
      setElements((prevState) => [...prevState, pathElement]);
    }

    setCurrentPath([]);
    setAction('none');
    setSelectedElement(null);
  };

  return (
    <div>
      <div style={{ position: 'fixed' }}>
        <input
          type='radio'
          id='selection'
          checked={tool === 'selection'}
          onChange={() => setTool('selection')}
        />
        <label htmlFor='selection'>Selection</label>
        <input
          type='radio'
          id='line'
          checked={tool === 'line'}
          onChange={() => setTool('line')}
        />
        <label htmlFor='line'>Line</label>
        <input
          type='radio'
          id='rectangle'
          checked={tool === 'rectangle'}
          onChange={() => setTool('rectangle')}
        />
        <label htmlFor='rectangle'>Rectangle</label>
        <input
          type='radio'
          id='circle'
          checked={tool === 'circle'}
          onChange={() => setTool('circle')}
        />
        <label htmlFor='circle'>Circle</label>
        <input
          type='radio'
          id='freehand'
          checked={tool === 'freehand'}
          onChange={() => setTool('freehand')}
        />
        <label htmlFor='freehand'>Pencil</label>
      </div>

      <canvas
        ref={canvasRef}
        id='canvas'
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        Canvas
      </canvas>
    </div>
  );
};

export default WhiteBoard;
