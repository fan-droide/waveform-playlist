import React, { FunctionComponent } from 'react';
import styled from 'styled-components';

interface ContainerProps {
  readonly $height: number;
  readonly $width?: number;
}

const Container = styled.div.attrs<ContainerProps>((props) => ({
  style: {
    height: `${props.$height}px`,
  },
}))<ContainerProps>`
  position: relative;
  ${(props) => props.$width !== undefined && `width: ${props.$width}px;`}
  background: transparent;
  z-index: 110;
`;

const BoxesContainer = styled.div<{ $offset?: number }>`
  position: relative;
  height: 100%;
  padding-left: ${(props) => props.$offset || 0}px;
`;

export interface AnnotationBoxesWrapperProps {
  className?: string;
  children?: React.ReactNode;
  height?: number;
  offset?: number;
  width?: number;
}

export const AnnotationBoxesWrapper: FunctionComponent<AnnotationBoxesWrapperProps> = ({
  children,
  className,
  height = 30,
  offset = 0,
  width,
}) => {
  return (
    <Container className={className} $height={height} $width={width}>
      <BoxesContainer $offset={offset}>{children}</BoxesContainer>
    </Container>
  );
};
