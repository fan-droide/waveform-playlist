import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { DotsIcon } from './TrackControls/DotsIcon';

export interface TrackMenuItem {
  id: string;
  label?: string;
  content: ReactNode;
}

export interface TrackMenuProps {
  items: TrackMenuItem[] | ((onClose: () => void) => TrackMenuItem[]);
}

const MenuContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const MenuButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
`;

const DROPDOWN_MIN_WIDTH = 180;

const Dropdown = styled.div<{ $top: number; $left: number }>`
  position: fixed;
  top: ${(p) => p.$top}px;
  left: ${(p) => p.$left}px;
  z-index: 10000;
  background: ${(p) => p.theme.timescaleBackgroundColor ?? '#222'};
  color: ${(p) => p.theme.textColor ?? 'inherit'};
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 6px;
  padding: 0.5rem 0;
  min-width: ${DROPDOWN_MIN_WIDTH}px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid rgba(128, 128, 128, 0.3);
  margin: 0.35rem 0;
`;

export const TrackMenu: React.FC<TrackMenuProps> = ({ items: itemsProp }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const items = typeof itemsProp === 'function' ? itemsProp(close) : itemsProp;
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dropHeight = dropdownRef.current?.offsetHeight ?? 160;

    // Prefer opening to the right of the button
    let left = rect.right + 4;
    if (left + DROPDOWN_MIN_WIDTH > vw) {
      left = rect.left - DROPDOWN_MIN_WIDTH - 4;
    }
    left = Math.max(4, Math.min(left, vw - DROPDOWN_MIN_WIDTH - 4));

    // Align top with the button, push up if it would overflow viewport
    let top = rect.top;
    if (top + dropHeight > vh - 4) {
      top = Math.max(4, rect.bottom - dropHeight);
    }

    setDropdownPos({ top, left });
  }, []);

  // Position on open, refine after mount, reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    updatePosition();

    // Refine once the dropdown has mounted and has actual dimensions
    const rafId = requestAnimationFrame(() => updatePosition());

    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <MenuContainer>
      <MenuButton
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Track menu"
        aria-label="Track menu"
      >
        <DotsIcon size={16} />
      </MenuButton>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <Dropdown
            ref={dropdownRef}
            $top={dropdownPos.top}
            $left={dropdownPos.left}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {items.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <Divider />}
                {item.content}
              </React.Fragment>
            ))}
          </Dropdown>,
          document.body
        )}
    </MenuContainer>
  );
};
