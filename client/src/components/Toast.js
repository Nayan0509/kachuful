import React from 'react';
import '../styles/Toast.css';

export default function Toast({ msg, type = 'info' }) {
  return <div className={`toast ${type}`}>{msg}</div>;
}
